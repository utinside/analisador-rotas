// Variáveis globais
let dados_transit = null;
let df_details = null;
let dados_summary = null;
let janelas_tempo = {};
let route_gantt_data = {};

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
        
        // Verificar se o arquivo é um ZIP
        if (!file.name.toLowerCase().endsWith('.zip')) {
            throw new Error('O arquivo deve ser um arquivo ZIP');
        }

        // Verificar se o arquivo está vazio
        if (file.size === 0) {
            throw new Error('O arquivo ZIP está vazio');
        }

        console.log('Carregando arquivo ZIP...');
        const zip = await JSZip.loadAsync(file);
        
        console.log('Arquivos encontrados no ZIP:', Object.keys(zip.files));
        
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
        for (const [key, pattern] of Object.entries(filePatterns)) {
            console.log(`Procurando arquivo com padrão: ${pattern}`);
            const matchingFiles = Object.keys(zip.files).filter(f => f.toLowerCase().endsWith(pattern.toLowerCase()));
            console.log(`Arquivos encontrados para ${pattern}:`, matchingFiles);
            
            if (matchingFiles.length > 0) {
                console.log(`Lendo conteúdo do arquivo: ${matchingFiles[0]}`);
                const content = await zip.file(matchingFiles[0]).async('string');
                fileContents[key] = content;
            } else {
                throw new Error(`Arquivo com padrão ${pattern} não encontrado no ZIP. Verifique se o arquivo contém todos os arquivos necessários.`);
            }
        }

        // Processar os arquivos
        try {
            console.log('Processando arquivo transitData.json...');
            dados_transit = JSON.parse(fileContents['transit']);
        } catch (e) {
            console.error('Erro ao processar transitData.json:', e);
            throw new Error('Erro ao processar o arquivo JSON de trânsito. Verifique se o arquivo está no formato correto.');
        }

        try {
            console.log('Processando arquivo CSV...');
            df_details = await processarCSV(fileContents['details']);
        } catch (e) {
            console.error('Erro ao processar CSV:', e);
            throw new Error('Erro ao processar o arquivo CSV de detalhes. Verifique se o arquivo está no formato correto.');
        }

        try {
            console.log('Processando arquivo summary...');
            dados_summary = JSON.parse(fileContents['summary']);
        } catch (e) {
            console.error('Erro ao processar summary:', e);
            throw new Error('Erro ao processar o arquivo JSON de sumário. Verifique se o arquivo está no formato correto.');
        }

        console.log('Processando dados...');
        processarDados();
        console.log('Atualizando interface...');
        atualizarInterface();
        
        showMessage('Arquivo processado com sucesso!', 'success');

    } catch (error) {
        console.error('Erro ao processar arquivo:', error);
        showMessage(error.message);
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
        if (row.type === '0') return;

        const time_str = row.nodeDayHourRange
            .replace("('", "")
            .replace("')", "")
            .replace("', '", " - ");

        const activity_type = row.type === '1' ? "Coleta" : "Entrega";

        gantt_data.push({
            "Task": `Pedido ${row.orderId}`,
            "Start": time_str,
            "Resource": activity_type
        });
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
    // Implementar criação da coluna de rotas
    // ... (código para criar a coluna de rotas)
}

function criarColunaPedidos() {
    // Implementar criação da coluna de pedidos
    // ... (código para criar a coluna de pedidos)
}

function criarColunaPedidosForaRota() {
    // Implementar criação da coluna de pedidos fora de rota
    // ... (código para criar a coluna de pedidos fora de rota)
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