// Funções auxiliares
function getTimeWindowHtml(timeWindow) {
    if (!timeWindow) {
        return "Não definido";
    }
    try {
        if (typeof timeWindow === 'object') {
            return `${timeWindow.start} - ${timeWindow.end}`;
        } else if (Array.isArray(timeWindow) && timeWindow.length >= 2) {
            return `${timeWindow[0]} - ${timeWindow[1]}`;
        } else {
            return "Formato inválido";
        }
    } catch {
        return "Formato inválido";
    }
}

function calculateTimeDifference(startTime, endTime) {
    try {
        const [startHours, startMinutes] = startTime.split(':').map(Number);
        const [endHours, endMinutes] = endTime.split(':').map(Number);

        if (startHours >= 24 || startMinutes >= 60 || endHours >= 24 || endMinutes >= 60) {
            return "Tempo inválido";
        }

        let startTotalMinutes = startHours * 60 + startMinutes;
        let endTotalMinutes = endHours * 60 + endMinutes;
        let diffMinutes = endTotalMinutes - startTotalMinutes;

        if (diffMinutes < 0) {
            diffMinutes += 24 * 60;
        }

        const hours = Math.floor(diffMinutes / 60);
        const minutes = diffMinutes % 60;

        return `${hours}h ${minutes}min`;
    } catch {
        return "Tempo inválido";
    }
}

// Função para processar o arquivo ZIP
async function processZipFile(file) {
    const zip = await JSZip.loadAsync(file);
    const fileContents = {};
    
    // Padrões de arquivos necessários
    const filePatterns = {
        'transit': '_transitData.json',
        'details': '_routes_details_transitData.csv',
        'summary': '_routes_summary_transitData.json'
    };

    // Encontrar os arquivos correspondentes
    for (const [key, pattern] of Object.entries(filePatterns)) {
        const matchingFiles = Object.keys(zip.files).filter(f => f.endsWith(pattern));
        if (matchingFiles.length > 0) {
            const content = await zip.file(matchingFiles[0]).async('string');
            fileContents[key] = content;
        } else {
            throw new Error(`Arquivo com padrão ${pattern} não encontrado no ZIP!`);
        }
    }

    return fileContents;
}

// Função para preparar dados do gráfico Gantt
function prepareGanttData(routeId, dfDetails) {
    const routeData = dfDetails.filter(row => row.routeId === routeId);
    const ganttData = [];

    for (const row of routeData) {
        if (row.type === 0) continue;

        const timeStr = row.nodeDayHourRange
            .replace("('", "")
            .replace("')", "")
            .replace("', '", " - ");

        const activityType = row.type === 1 ? "Coleta" : "Entrega";

        ganttData.push({
            "Task": `Pedido ${row.orderId}`,
            "Start": timeStr,
            "Resource": activityType
        });
    }

    return ganttData;
}

// Função para criar o gráfico Gantt
function createGanttChart(routeIndex, dadosSummary, routeGanttData) {
    const route = dadosSummary[routeIndex];
    if (!route) {
        document.getElementById('gantt-chart').innerHTML =
            '<div class="text-center text-gray-500 py-4">Dados da rota não encontrados</div>';
        return;
    }

    const routeId = route.id || route.route_id || routeIndex;
    const ganttData = routeGanttData[routeId] || [];

    if (ganttData.length > 0) {
        const tasks = ganttData.map(item => item.Task);
        const startTimes = ganttData.map(item => item.Start);
        const resources = ganttData.map(item => item.Resource);
        const colors = resources.map(resource =>
            resource === 'Entrega' ? 'rgb(54, 162, 235)' : 'rgb(255, 99, 132)'
        );

        const pedido0Index = tasks.findIndex(task => task.includes('Pedido 0'));
        let orderedTasks = [...tasks];
        let orderedStartTimes = [...startTimes];
        let orderedResources = [...resources];
        let orderedColors = [...colors];

        if (pedido0Index !== -1) {
            orderedTasks = [tasks[pedido0Index], ...tasks.slice(0, pedido0Index), ...tasks.slice(pedido0Index + 1)];
            orderedStartTimes = [startTimes[pedido0Index], ...startTimes.slice(0, pedido0Index), ...startTimes.slice(pedido0Index + 1)];
            orderedResources = [resources[pedido0Index], ...resources.slice(0, pedido0Index), ...resources.slice(pedido0Index + 1)];
            orderedColors = [colors[pedido0Index], ...colors.slice(0, pedido0Index), ...colors.slice(pedido0Index + 1)];
        }

        const data = [{
            x: orderedStartTimes,
            y: orderedTasks,
            mode: 'markers+lines',
            type: 'scatter',
            marker: {
                color: orderedColors,
                size: 12,
                symbol: 'circle'
            },
            line: {
                color: 'rgba(150, 150, 150, 0.3)',
                width: 2,
                dash: 'dot'
            },
            text: orderedResources.map((resource, i) =>
                `${orderedTasks[i]}<br>Horário: ${orderedStartTimes[i]}<br>Tipo: ${resource}`
            ),
            hoverinfo: 'text'
        }];

        const layout = {
            title: '',
            height: 600,
            margin: { l: 50, r: 20, t: 10, b: 40 },
            xaxis: {
                title: 'Horário',
                showgrid: true,
                zeroline: false
            },
            yaxis: {
                title: 'Pedidos',
                showticklabels: false,
                showgrid: true,
                autorange: "reversed"
            }
        };

        const config = {
            displayModeBar: false,
            responsive: true
        };

        Plotly.newPlot('gantt-chart', data, layout, config);
    } else {
        document.getElementById('gantt-chart').innerHTML =
            '<div class="text-center text-gray-500 py-4">Sem dados de cronograma disponíveis</div>';
    }
}

// Função para mostrar o modal com o gráfico Gantt
function showGanttChart(routeIndex, dadosSummary, routeGanttData) {
    const modal = document.getElementById('gantt-modal');
    const modalTitle = document.getElementById('modal-title');
    modalTitle.textContent = 'Cronograma de Entregas - Rota ' + (routeIndex + 1);
    modal.style.display = 'block';
    createGanttChart(routeIndex, dadosSummary, routeGanttData);
}

// Função para fechar o modal
function closeModal() {
    const modal = document.getElementById('gantt-modal');
    modal.style.display = 'none';
}

// Função para processar os dados e gerar o HTML
function processData(fileContents) {
    const dadosTransit = JSON.parse(fileContents.transit);
    const dadosSummary = JSON.parse(fileContents.summary);
    
    // Converter CSV para DataFrame usando Papa Parse
    const dfDetails = Papa.parse(fileContents.details, {
        header: true,
        dynamicTyping: true
    }).data;

    // Inicializar conjuntos para armazenar IDs de pedidos
    const jsonOrderIds = new Set();
    const csvOrderIds = new Set(dfDetails.filter(row => row.orderId !== 0).map(row => row.orderId));

    // Processar janelas de tempo
    const janelasTempo = {};
    if (dadosTransit.orders && Array.isArray(dadosTransit.orders)) {
        for (const pedido of dadosTransit.orders) {
            if (pedido && typeof pedido === 'object' && 'orderId' in pedido) {
                janelasTempo[pedido.orderId] = {
                    'delivery': pedido.deliveryTW || null,
                    'pickup': pedido.pickupTW || null,
                    'minutes_delivery': pedido.timeForDelivery || 0,
                    'minutes_pickup': pedido.timeForPickup || 0,
                    'minutes_items_delivery': pedido.minutesItemsDelivery || 0,
                    'minutes_items_pickup': pedido.minutesItemsPickup || 0,
                    'weight': pedido.weight || 0,
                    'volume': pedido.volume || 0
                };
                jsonOrderIds.add(pedido.orderId);
            }
        }
    }

    const pedidosFora = [...jsonOrderIds].filter(id => !csvOrderIds.has(id));
    const totalRotas = dadosSummary.length;

    // Preparar dados de Gantt para todas as rotas
    const routeGanttData = {};
    const uniqueRoutes = [...new Set(dfDetails.map(row => row.routeId))];
    for (const routeId of uniqueRoutes) {
        routeGanttData[routeId] = prepareGanttData(routeId, dfDetails);
    }

    // Gerar HTML do container de análise
    const analysisContainer = document.getElementById('analysis-container');
    analysisContainer.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
            <!-- Visão Rotas -->
            <div class="bg-white rounded-2xl shadow-lg p-6 space-y-6">
                <div class="border-b pb-4">
                    <h1 class="text-3xl font-semibold text-gray-800">Visão Rotas (${totalRotas})</h1>
                </div>
                <div class="grid grid-cols-1 gap-4">
                    ${dadosSummary.map((route, idx) => `
                        <div class="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                            <div class="space-y-4">
                                <div class="flex justify-between items-center">
                                    <div class="text-lg text-gray-800 font-semibold cursor-pointer hover:text-blue-600" onclick="showGanttChart(${idx}, ${JSON.stringify(dadosSummary)}, ${JSON.stringify(routeGanttData)})">Rota ${idx + 1} (${route.nOrders})</div>
                                    <div class="text-sm text-gray-500"><span class="font-bold">Veículo:</span> ${route.vehicle.id}</div>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <div class="text-sm text-gray-600 font-bold flex items-center">
                                            Peso
                                            <span class="tooltip ml-1" data-tooltip="Capacidade máxima: ${route.vehicle.maxWeight} Kg">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-4 h-4 text-gray-400">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </span>
                                        </div>
                                        <div class="flex items-center mt-1">
                                            <div class="flex-grow bg-gray-200 rounded-full h-2">
                                                <div class="bg-blue-600 rounded-full h-2" style="width: ${Math.round((route.maxWeight / route.vehicle.maxWeight) * 100)}%"></div>
                                            </div>
                                            <span class="text-sm text-gray-600 ml-2">${Math.round((route.maxWeight / route.vehicle.maxWeight) * 100)}%</span>
                                        </div>
                                    </div>
                                    <div>
                                        <div class="text-sm text-gray-600 font-bold flex items-center">
                                            Volume
                                            <span class="tooltip ml-1" data-tooltip="Capacidade máxima: ${route.vehicle.maxVolume} m³">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-4 h-4 text-gray-400">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </span>
                                        </div>
                                        <div class="flex items-center mt-1">
                                            <div class="flex-grow bg-gray-200 rounded-full h-2">
                                                <div class="bg-green-600 rounded-full h-2" style="width: ${Math.round((route.maxVolume / route.vehicle.maxVolume) * 100)}%"></div>
                                            </div>
                                            <span class="text-sm text-gray-600 ml-2">${Math.round((route.maxVolume / route.vehicle.maxVolume) * 100)}%</span>
                                        </div>
                                    </div>
                                    <div>
                                        <div class="text-sm text-gray-600 font-bold flex items-center">
                                            Tempo
                                            <span class="tooltip ml-1" data-tooltip="Jornada de trabalho: ${route.vehicle.workingHours} horas">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-4 h-4 text-gray-400">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </span>
                                        </div>
                                        <div class="flex items-center mt-1">
                                            <div class="flex-grow bg-gray-200 rounded-full h-2">
                                                <div class="bg-purple-600 rounded-full h-2" style="width: ${Math.round((route.totalTime / 3600 / route.vehicle.workingHours) * 100)}%"></div>
                                            </div>
                                            <span class="text-sm text-gray-600 ml-2">${Math.round((route.totalTime / 3600 / route.vehicle.workingHours) * 100)}%</span>
                                        </div>
                                    </div>
                                </div>
                                <div class="grid grid-cols-1 gap-4 mt-2">
                                    <div class="flex items-center space-x-2 justify-between bg-gray-50 p-2 rounded-lg">
                                        <span class="text-sm text-gray-600"><span class="font-bold">Início:</span> ${route.routeStartDayHourRange[0]}</span>
                                        <span class="text-sm text-gray-600">|</span>
                                        <span class="text-sm text-gray-600"><span class="font-bold">Fim:</span> ${route.routeEndDayHourRange[0]}</span>
                                        <span class="text-sm text-gray-600">|</span>
                                        <span class="text-sm text-gray-600"><span class="font-bold">Total:</span> ${calculateTimeDifference(route.routeStartDayHourRange[0], route.routeEndDayHourRange[0])}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Visão Pedidos -->
            <div class="bg-white rounded-2xl shadow-lg p-6 space-y-6">
                <div class="border-b pb-4">
                    <h1 class="text-3xl font-semibold text-gray-800">Visão Pedidos (${csvOrderIds.size})</h1>
                    <div class="flex space-x-3 mt-3">
                        <button onclick="toggleAllAccordions(true)" class="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors">
                            Abrir Todos
                        </button>
                        <button onclick="toggleAllAccordions(false)" class="px-3 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600 transition-colors">
                            Fechar Todos
                        </button>
                    </div>
                </div>
                <div class="grid grid-cols-1 gap-4">
                    ${[...csvOrderIds].sort().map(pedido => `
                        <div class="bg-white border border-gray-200 rounded-xl hover:shadow-md transition-shadow">
                            <button onclick="toggleAccordion('accordion-${pedido}')" class="w-full p-4 text-left flex justify-between items-center">
                                <div class="text-lg text-gray-800 font-semibold">Pedido: ${pedido}</div>
                                <svg id="icon-${pedido}" class="w-6 h-6 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                            <div id="accordion-${pedido}" class="hidden p-4 pt-0">
                                <div class="space-y-2">
                                    <div class="flex items-center space-x-2">
                                        <span class="text-sm text-gray-600 font-bold">Peso:</span>
                                        <span class="text-sm font-medium text-black">
                                            ${janelasTempo[pedido]?.weight?.toFixed(2) || 0} Kg
                                        </span>
                                    </div>
                                    <div class="flex items-center space-x-2">
                                        <span class="text-sm text-gray-600 font-bold">Volume:</span>
                                        <span class="text-sm font-medium text-black">
                                            ${janelasTempo[pedido]?.volume?.toFixed(2) || 0} m³
                                        </span>
                                    </div>
                                    <div class="flex items-center space-x-2">
                                        <span class="text-sm text-gray-600 font-bold">Jan. de Tempo Entrega:</span>
                                        <span class="text-sm font-medium text-black">
                                            ${getTimeWindowHtml(janelasTempo[pedido]?.delivery)}
                                        </span>
                                    </div>
                                    <div class="flex items-center space-x-2">
                                        <span class="text-sm text-gray-600 font-bold">Jan. de Tempo Coleta:</span>
                                        <span class="text-sm font-medium text-black">
                                            ${getTimeWindowHtml(janelasTempo[pedido]?.pickup)}
                                        </span>
                                    </div>
                                    <div class="flex items-center space-x-2">
                                        <span class="text-sm text-gray-600 font-bold">Minutos por pedido entrega:</span>
                                        <span class="text-sm font-medium text-black">
                                            ${janelasTempo[pedido]?.minutes_delivery || 0}
                                        </span>
                                    </div>
                                    <div class="flex items-center space-x-2">
                                        <span class="text-sm text-gray-600 font-bold">Minutos por pedido coleta:</span>
                                        <span class="text-sm font-medium text-black">
                                            ${janelasTempo[pedido]?.minutes_pickup || 0}
                                        </span>
                                    </div>
                                    <div class="flex items-center space-x-2">
                                        <span class="text-sm text-gray-600 font-bold">Minutos por item entrega:</span>
                                        <span class="text-sm font-medium text-black">
                                            ${janelasTempo[pedido]?.minutes_items_delivery || 0}
                                        </span>
                                    </div>
                                    <div class="flex items-center space-x-2">
                                        <span class="text-sm text-gray-600 font-bold">Minutos por item coleta:</span>
                                        <span class="text-sm font-medium text-black">
                                            ${janelasTempo[pedido]?.minutes_items_pickup || 0}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Pedidos Fora de Rota -->
            <div class="bg-white rounded-2xl shadow-lg p-6 space-y-6">
                <div class="border-b pb-4">
                    <h1 class="text-3xl font-semibold text-gray-800">Pedidos Fora de Rota (${pedidosFora.length})</h1>
                </div>
                <div class="grid grid-cols-1 gap-4">
                    ${pedidosFora.sort().map(pedido => `
                        <div class="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                            <div class="flex justify-between items-center">
                                <div class="text-lg text-gray-800 font-semibold">Pedido: ${pedido}</div>
                            </div>
                            <div class="mt-2 space-y-2">
                                <div class="flex items-center space-x-2">
                                    <span class="text-sm text-gray-600 font-bold">Peso:</span>
                                    <span class="text-sm font-medium text-black">
                                        ${janelasTempo[pedido]?.weight?.toFixed(2) || 0} Kg
                                    </span>
                                    ${janelasTempo[pedido]?.weight > 20 ? '<span class="ml-2 text-xs font-bold px-1 py-0.5 bg-yellow-200 rounded tooltip" style="color: #e53d51;" data-tooltip="Possível ofensor">&lt;&lt; Atenção</span>' : ''}
                                </div>
                                <div class="flex items-center space-x-2">
                                    <span class="text-sm text-gray-600 font-bold">Volume:</span>
                                    <span class="text-sm font-medium text-black">
                                        ${janelasTempo[pedido]?.volume?.toFixed(2) || 0} m³
                                    </span>
                                </div>
                                <div class="flex items-center space-x-2">
                                    <span class="text-sm text-gray-600 font-bold">Jan. de Tempo Entrega:</span>
                                    <span class="text-sm font-medium text-black">
                                        ${getTimeWindowHtml(janelasTempo[pedido]?.delivery)}
                                    </span>
                                    ${getTimeWindowHtml(janelasTempo[pedido]?.delivery) !== "Não definido" ? '<span class="ml-2 text-xs font-bold px-1 py-0.5 bg-yellow-200 rounded tooltip" style="color: #e53d51;" data-tooltip="Possível ofensor">&lt;&lt; Atenção</span>' : ''}
                                </div>
                                <div class="flex items-center space-x-2">
                                    <span class="text-sm text-gray-600 font-bold">Jan. de Tempo Coleta:</span>
                                    <span class="text-sm font-medium text-black">
                                        ${getTimeWindowHtml(janelasTempo[pedido]?.pickup)}
                                    </span>
                                    ${getTimeWindowHtml(janelasTempo[pedido]?.pickup) !== "Não definido" ? '<span class="ml-2 text-xs font-bold px-1 py-0.5 bg-yellow-200 rounded tooltip" style="color: #e53d51;" data-tooltip="Possível ofensor">&lt;&lt; Atenção</span>' : ''}
                                </div>
                                <div class="flex items-center space-x-2">
                                    <span class="text-sm text-gray-600 font-bold">Minutos por pedido entrega:</span>
                                    <span class="text-sm font-medium text-black">
                                        ${janelasTempo[pedido]?.minutes_delivery || 0}
                                    </span>
                                </div>
                                <div class="flex items-center space-x-2">
                                    <span class="text-sm text-gray-600 font-bold">Minutos por pedido coleta:</span>
                                    <span class="text-sm font-medium text-black">
                                        ${janelasTempo[pedido]?.minutes_pickup || 0}
                                    </span>
                                </div>
                                <div class="flex items-center space-x-2">
                                    <span class="text-sm text-gray-600 font-bold">Minutos por item entrega:</span>
                                    <span class="text-sm font-medium text-black">
                                        ${janelasTempo[pedido]?.minutes_items_delivery || 0}
                                    </span>
                                </div>
                                <div class="flex items-center space-x-2">
                                    <span class="text-sm text-gray-600 font-bold">Minutos por item coleta:</span>
                                    <span class="text-sm font-medium text-black">
                                        ${janelasTempo[pedido]?.minutes_items_pickup || 0}
                                    </span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;

    // Mostrar o container de análise
    analysisContainer.classList.remove('hidden');
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    const dropzoneFile = document.getElementById('dropzone-file');
    const analysisContainer = document.getElementById('analysis-container');

    // Evento de drag and drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzoneFile.parentElement.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzoneFile.parentElement.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzoneFile.parentElement.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e) {
        dropzoneFile.parentElement.classList.add('border-blue-500');
    }

    function unhighlight(e) {
        dropzoneFile.parentElement.classList.remove('border-blue-500');
    }

    dropzoneFile.parentElement.addEventListener('drop', handleDrop, false);
    dropzoneFile.addEventListener('change', handleFileSelect, false);

    async function handleDrop(e) {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        await handleFile(file);
    }

    function handleFileSelect(e) {
        const file = e.target.files[0];
        handleFile(file);
    }

    async function handleFile(file) {
        if (!file) return;
        if (!file.name.endsWith('.zip')) {
            alert('Por favor, selecione um arquivo ZIP válido.');
            return;
        }

        try {
            const fileContents = await processZipFile(file);
            processData(fileContents);
        } catch (error) {
            alert('Erro ao processar o arquivo: ' + error.message);
        }
    }
});

// Funções de acordeão
function toggleAccordion(id) {
    const content = document.getElementById(id);
    const icon = document.getElementById('icon-' + id.split('-')[1]);

    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        icon.classList.add('rotate-180');
    } else {
        content.classList.add('hidden');
        icon.classList.remove('rotate-180');
    }
}

function toggleAllAccordions(show) {
    const accordions = document.querySelectorAll('[id^="accordion-"]');
    const icons = document.querySelectorAll('[id^="icon-"]');

    accordions.forEach(acc => {
        if (show) {
            acc.classList.remove('hidden');
        } else {
            acc.classList.add('hidden');
        }
    });

    icons.forEach(icon => {
        if (show) {
            icon.classList.add('rotate-180');
        } else {
            icon.classList.remove('rotate-180');
        }
    });
} 