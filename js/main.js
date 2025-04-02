// Variáveis globais
let dados_transit = null;
let df_details = null;
let dados_summary = null;
let janelas_tempo = {};
let route_gantt_data = {};

// Função para mostrar/esconder a barra de progresso
function toggleProgressBar(show) {
    const progressContainer = document.getElementById('progress-container');
    progressContainer.classList.toggle('hidden', !show);
}

// Função para atualizar a barra de progresso
function updateProgress(percentage, text) {
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const progressPercentage = document.getElementById('progress-percentage');
    
    progressBar.style.width = `${percentage}%`;
    progressText.textContent = text;
    progressPercentage.textContent = `${percentage}%`;
}

// Função para mostrar mensagens na interface
function showMessage(message, type = 'error') {
    const messageArea = document.getElementById('message-area');
    const messageElement = document.createElement('div');
    messageElement.className = `p-4 rounded-lg mb-4 ${type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`;
    messageElement.textContent = message;
    
    // Limpar mensagens anteriores
    messageArea.innerHTML = '';
    messageArea.appendChild(messageElement);
    
    // Remover a mensagem após 5 segundos
    setTimeout(() => {
        messageElement.remove();
    }, 5000);
}

// Função para processar o arquivo ZIP
async function processarArquivoZip(file) {
    try {
        console.log('Iniciando processamento do arquivo:', file.name);
        toggleProgressBar(true);
        updateProgress(0, 'Iniciando processamento...');
        
        // Verificar se o arquivo é um ZIP
        if (!file.name.toLowerCase().endsWith('.zip')) {
            throw new Error('O arquivo deve ser um arquivo ZIP');
        }

        // Verificar se o arquivo está vazio
        if (file.size === 0) {
            throw new Error('O arquivo ZIP está vazio');
        }

        updateProgress(10, 'Carregando arquivo ZIP...');
        console.log('Carregando arquivo ZIP...');
        const zip = await JSZip.loadAsync(file);
        
        console.log('Arquivos encontrados no ZIP:', Object.keys(zip.files));
        updateProgress(20, 'Analisando arquivos do ZIP...');
        
        const fileContents = {};
        
        // Padrões de arquivos necessários
        const filePatterns = {
            'transit': '_transitData.json',
            'details': '_routes_details_transitData.csv',
            'summary': '_routes_summary_transitData.json'
        };

        // Verificar se há arquivos no ZIP
        if (Object.keys(zip.files).length === 0) {
            throw new Error('O arquivo ZIP está vazio ou corrompido');
        }

        // Encontrar os arquivos correspondentes
        let progressStep = 30;
        for (const [key, pattern] of Object.entries(filePatterns)) {
            console.log(`Procurando arquivo com padrão: ${pattern}`);
            updateProgress(progressStep, `Procurando arquivo ${pattern}...`);
            
            const matchingFiles = Object.keys(zip.files).filter(f => f.toLowerCase().endsWith(pattern.toLowerCase()));
            console.log(`Arquivos encontrados para ${pattern}:`, matchingFiles);
            
            if (matchingFiles.length > 0) {
                console.log(`Lendo conteúdo do arquivo: ${matchingFiles[0]}`);
                const content = await zip.file(matchingFiles[0]).async('string');
                fileContents[key] = content;
            } else {
                throw new Error(`Arquivo com padrão ${pattern} não encontrado no ZIP. Verifique se o arquivo contém todos os arquivos necessários.`);
            }
            progressStep += 20;
        }

        // Processar os arquivos
        try {
            console.log('Processando arquivo transitData.json...');
            updateProgress(70, 'Processando arquivo JSON de trânsito...');
            dados_transit = JSON.parse(fileContents['transit']);
        } catch (e) {
            console.error('Erro ao processar transitData.json:', e);
            throw new Error('Erro ao processar o arquivo JSON de trânsito. Verifique se o arquivo está no formato correto.');
        }

        try {
            console.log('Processando arquivo CSV...');
            updateProgress(80, 'Processando arquivo CSV...');
            df_details = await processarCSV(fileContents['details']);
        } catch (e) {
            console.error('Erro ao processar CSV:', e);
            throw new Error('Erro ao processar o arquivo CSV de detalhes. Verifique se o arquivo está no formato correto.');
        }

        try {
            console.log('Processando arquivo summary...');
            updateProgress(90, 'Processando arquivo JSON de sumário...');
            dados_summary = JSON.parse(fileContents['summary']);
        } catch (e) {
            console.error('Erro ao processar summary:', e);
            throw new Error('Erro ao processar o arquivo JSON de sumário. Verifique se o arquivo está no formato correto.');
        }

        console.log('Processando dados...');
        updateProgress(95, 'Processando dados...');
        processarDados();
        
        console.log('Atualizando interface...');
        updateProgress(100, 'Atualizando interface...');
        atualizarInterface();
        
        showMessage('Arquivo processado com sucesso!', 'success');
        
        // Esconder a barra de progresso após 2 segundos
        setTimeout(() => {
            toggleProgressBar(false);
            updateProgress(0, '');
        }, 2000);

    } catch (error) {
        console.error('Erro ao processar arquivo:', error);
        showMessage(error.message);
        toggleProgressBar(false);
        updateProgress(0, '');
    }
}

// Função para processar CSV
async function processarCSV(csvString) {
    const lines = csvString.split('\n');
    const headers = lines[0].split(',');
    const data = lines.slice(1).map(line => {
        const values = line.split(',');
        const row = {};
        headers.forEach((header, index) => {
            row[header.trim()] = values[index]?.trim();
        });
        return row;
    });
    return data;
}

// Função para processar dados
function processarDados() {
    // Inicializar conjuntos para armazenar IDs de pedidos
    const json_order_ids = new Set();
    const csv_order_ids = new Set(df_details.filter(row => row.orderId !== '0').map(row => row.orderId));

    // Processar janelas de tempo
    if (dados_transit.orders) {
        dados_transit.orders.forEach(pedido => {
            if (pedido.orderId) {
                janelas_tempo[pedido.orderId] = {
                    'delivery': pedido.deliveryTW || null,
                    'pickup': pedido.pickupTW || null,
                    'minutes_delivery': pedido.timeForDelivery || 0,
                    'minutes_pickup': pedido.timeForPickup || 0,
                    'minutes_items_delivery': pedido.minutesItemsDelivery || 0,
                    'minutes_items_pickup': pedido.minutesItemsPickup || 0,
                    'weight': pedido.weight || 0,
                    'volume': pedido.volume || 0
                };
                json_order_ids.add(pedido.orderId);
            }
        });
    }

    // Processar dados do Gantt
    const unique_routes = [...new Set(df_details.map(row => row.routeId))];
    unique_routes.forEach(route_id => {
        route_gantt_data[route_id] = prepareGanttData(route_id);
    });
}

// Função para preparar dados do Gantt
function prepareGanttData(route_id) {
    const route_data = df_details.filter(row => row.routeId === route_id);
    const gantt_data = [];

    route_data.forEach(row => {
        // Verificar se o tipo é válido
        if (!row.type || row.type === '0') return;

        // Verificar se nodeDayHourRange existe e é uma string
        if (!row.nodeDayHourRange || typeof row.nodeDayHourRange !== 'string') {
            console.warn(`Dados inválidos para o pedido ${row.orderId}: nodeDayHourRange não encontrado ou inválido`);
            return;
        }

        try {
            const time_str = row.nodeDayHourRange
                .replace("('", "")
                .replace("')", "")
                .replace("', '", " - ");

            const activity_type = row.type === '1' ? "Coleta" : "Entrega";

            gantt_data.push({
                "Task": `Pedido ${row.orderId || 'Sem ID'}`,
                "Start": time_str,
                "Resource": activity_type
            });
        } catch (error) {
            console.error(`Erro ao processar dados do pedido ${row.orderId}:`, error);
        }
    });

    return gantt_data;
}

// Função para atualizar a interface
function atualizarInterface() {
    const container = document.getElementById('content-container');
    container.innerHTML = ''; // Limpar conteúdo existente

    // Adicionar as três colunas
    container.appendChild(criarColunaRotas());
    container.appendChild(criarColunaPedidos());
    container.appendChild(criarColunaPedidosForaRota());
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    const dropzone = document.getElementById('dropzone-file');
    
    dropzone.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            processarArquivoZip(file);
        }
    });

    // Adicionar suporte para drag and drop
    const dropZone = document.querySelector('.flex.flex-col.items-center');
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-blue-500');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-blue-500');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-blue-500');
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.zip')) {
            dropzone.files = e.dataTransfer.files;
            processarArquivoZip(file);
        } else {
            alert('Por favor, selecione um arquivo ZIP válido.');
        }
    });
});

// Funções auxiliares para criar as colunas
function criarColunaRotas() {
    const coluna = document.createElement('div');
    coluna.className = 'bg-white rounded-2xl shadow-lg p-6';
    
    const titulo = document.createElement('h2');
    titulo.className = 'text-xl font-semibold text-gray-800 mb-4';
    titulo.textContent = 'Rotas';
    coluna.appendChild(titulo);

    const lista = document.createElement('div');
    lista.className = 'space-y-4';

    if (dados_summary && dados_summary.routes) {
        dados_summary.routes.forEach((rota, index) => {
            const card = document.createElement('div');
            card.className = 'bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors cursor-pointer';
            card.onclick = () => showGanttChart(index);

            const header = document.createElement('div');
            header.className = 'flex justify-between items-center mb-2';
            
            const rotaTitulo = document.createElement('h3');
            rotaTitulo.className = 'font-medium text-gray-700';
            rotaTitulo.textContent = `Rota ${index + 1}`;
            
            const expandirBtn = document.createElement('button');
            expandirBtn.className = 'text-gray-500 hover:text-gray-700';
            expandirBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>';
            
            header.appendChild(rotaTitulo);
            header.appendChild(expandirBtn);

            const detalhes = document.createElement('div');
            detalhes.className = 'text-sm text-gray-600 space-y-1';
            
            const pedidos = document.createElement('p');
            pedidos.textContent = `Pedidos: ${rota.orders.length}`;
            
            const distancia = document.createElement('p');
            distancia.textContent = `Distância: ${rota.distance.toFixed(2)} km`;
            
            const tempo = document.createElement('p');
            tempo.textContent = `Tempo: ${rota.duration} minutos`;
            
            detalhes.appendChild(pedidos);
            detalhes.appendChild(distancia);
            detalhes.appendChild(tempo);

            card.appendChild(header);
            card.appendChild(detalhes);
            lista.appendChild(card);
        });
    } else {
        const mensagem = document.createElement('p');
        mensagem.className = 'text-gray-500 text-center';
        mensagem.textContent = 'Nenhuma rota encontrada';
        lista.appendChild(mensagem);
    }

    coluna.appendChild(lista);
    return coluna;
}

function criarColunaPedidos() {
    const coluna = document.createElement('div');
    coluna.className = 'bg-white rounded-2xl shadow-lg p-6';
    
    const titulo = document.createElement('h2');
    titulo.className = 'text-xl font-semibold text-gray-800 mb-4';
    titulo.textContent = 'Pedidos em Rota';
    coluna.appendChild(titulo);

    const lista = document.createElement('div');
    lista.className = 'space-y-4';

    if (df_details) {
        const pedidosEmRota = df_details.filter(row => row.orderId !== '0');
        pedidosEmRota.forEach(pedido => {
            const card = document.createElement('div');
            card.className = 'bg-gray-50 rounded-lg p-4';

            const header = document.createElement('div');
            header.className = 'flex justify-between items-center mb-2';
            
            const pedidoTitulo = document.createElement('h3');
            pedidoTitulo.className = 'font-medium text-gray-700';
            pedidoTitulo.textContent = `Pedido ${pedido.orderId}`;
            
            const tipo = document.createElement('span');
            tipo.className = 'text-sm text-gray-500';
            tipo.textContent = pedido.type === '1' ? 'Coleta' : 'Entrega';
            
            header.appendChild(pedidoTitulo);
            header.appendChild(tipo);

            const detalhes = document.createElement('div');
            detalhes.className = 'text-sm text-gray-600 space-y-1';
            
            const horario = document.createElement('p');
            horario.textContent = `Horário: ${pedido.nodeDayHourRange}`;
            
            const rota = document.createElement('p');
            rota.textContent = `Rota: ${pedido.routeId}`;
            
            detalhes.appendChild(horario);
            detalhes.appendChild(rota);

            card.appendChild(header);
            card.appendChild(detalhes);
            lista.appendChild(card);
        });
    } else {
        const mensagem = document.createElement('p');
        mensagem.className = 'text-gray-500 text-center';
        mensagem.textContent = 'Nenhum pedido em rota encontrado';
        lista.appendChild(mensagem);
    }

    coluna.appendChild(lista);
    return coluna;
}

function criarColunaPedidosForaRota() {
    const coluna = document.createElement('div');
    coluna.className = 'bg-white rounded-2xl shadow-lg p-6';
    
    const titulo = document.createElement('h2');
    titulo.className = 'text-xl font-semibold text-gray-800 mb-4';
    titulo.textContent = 'Pedidos Fora de Rota';
    coluna.appendChild(titulo);

    const lista = document.createElement('div');
    lista.className = 'space-y-4';

    if (dados_transit && dados_transit.orders) {
        const pedidosForaRota = dados_transit.orders.filter(pedido => {
            return !df_details.some(row => row.orderId === pedido.orderId);
        });

        pedidosForaRota.forEach(pedido => {
            const card = document.createElement('div');
            card.className = 'bg-gray-50 rounded-lg p-4';

            const header = document.createElement('div');
            header.className = 'flex justify-between items-center mb-2';
            
            const pedidoTitulo = document.createElement('h3');
            pedidoTitulo.className = 'font-medium text-gray-700';
            pedidoTitulo.textContent = `Pedido ${pedido.orderId}`;
            
            const tipo = document.createElement('span');
            tipo.className = 'text-sm text-gray-500';
            tipo.textContent = pedido.type === '1' ? 'Coleta' : 'Entrega';
            
            header.appendChild(pedidoTitulo);
            header.appendChild(tipo);

            const detalhes = document.createElement('div');
            detalhes.className = 'text-sm text-gray-600 space-y-1';
            
            if (janelas_tempo[pedido.orderId]) {
                const janela = document.createElement('p');
                janela.textContent = `Janela de Tempo: ${janelas_tempo[pedido.orderId].delivery || janelas_tempo[pedido.orderId].pickup || 'Não definida'}`;
                detalhes.appendChild(janela);
            }
            
            const peso = document.createElement('p');
            peso.textContent = `Peso: ${pedido.weight || 0} kg`;
            
            const volume = document.createElement('p');
            volume.textContent = `Volume: ${pedido.volume || 0} m³`;
            
            detalhes.appendChild(peso);
            detalhes.appendChild(volume);

            card.appendChild(header);
            card.appendChild(detalhes);
            lista.appendChild(card);
        });
    } else {
        const mensagem = document.createElement('p');
        mensagem.className = 'text-gray-500 text-center';
        mensagem.textContent = 'Nenhum pedido fora de rota encontrado';
        lista.appendChild(mensagem);
    }

    coluna.appendChild(lista);
    return coluna;
}

// Funções do modal
function showGanttChart(routeIndex) {
    const modal = document.getElementById('gantt-modal');
    const modalTitle = document.getElementById('modal-title');
    modalTitle.textContent = 'Cronograma de Entregas - Rota ' + (routeIndex + 1);
    modal.style.display = 'block';
    createGanttChart(routeIndex);
}

function closeModal() {
    const modal = document.getElementById('gantt-modal');
    modal.style.display = 'none';
}

// Fechar o modal quando clicar fora dele
window.onclick = function(event) {
    const modal = document.getElementById('gantt-modal');
    if (event.target == modal) {
        modal.style.display = 'none';
    }
} 