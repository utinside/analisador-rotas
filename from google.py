from google.colab import files
from IPython.display import clear_output, HTML
import json
import pandas as pd
import zipfile
import io

# Limpar saída anterior
clear_output()

# Upload do arquivo ZIP
print("Por favor, faça upload do arquivo ZIP contendo os arquivos de análise")
uploaded = files.upload()

# Limpar saída após upload
clear_output()

# Pegar o nome do arquivo ZIP
zip_filename = list(uploaded.keys())[0]

# Padrões de arquivos necessários
file_patterns = {
    'transit': '_transitData.json',
    'details': '_routes_details_transitData.csv',
    'summary': '_routes_summary_transitData.json'
}

file_contents = {}

# Extrair arquivos do ZIP
with zipfile.ZipFile(io.BytesIO(uploaded[zip_filename]), 'r') as zip_ref:
    file_list = zip_ref.namelist()

    # Encontrar os arquivos correspondentes
    for key, pattern in file_patterns.items():
        matching_files = [f for f in file_list if f.endswith(pattern)]
        if matching_files:
            file_contents[key] = zip_ref.read(matching_files[0])
        else:
            print(f"Arquivo com padrão {pattern} não encontrado no ZIP!")
            exit()

# Carregar JSON de pedidos
dados_transit = json.loads(file_contents['transit'])

# Carregar CSV de rotas
df_details = pd.read_csv(io.BytesIO(file_contents['details']))

# Após carregar o JSON de sumário
dados_summary = json.loads(file_contents['summary'])
print(f"Conteúdo de dados_summary: {dados_summary[:2] if dados_summary else 'Vazio'}")

# Inicializar conjuntos para armazenar IDs de pedidos
json_order_ids = set()
csv_order_ids = set(df_details[df_details['orderId'] != 0]['orderId'].unique())

# Verificar se dados_summary não está vazio antes de calcular o máximo
if dados_summary:
    # Encontrar o maior percentual de peso utilizado
    max_weight_percentage = max(route['maxWeight'] for route in dados_summary)
else:
    # Definir um valor padrão se não houver rotas
    max_weight_percentage = 0

# Criar HTML com os resultados usando Tailwind CSS
# Calcular porcentagens para cada rota
for route in dados_summary:
    vehicle_max_weight = route['vehicle']['maxWeight']  # 249.99
    vehicle_max_volume = route['vehicle']['maxVolume']  # 1.5
    vehicle_working_hours = route['vehicle']['workingHours']  # 9.0 horas
    route_time_hours = route['totalTime'] / 3600  # convertendo segundos para horas

    route['weight_percentage'] = (route['maxWeight'] / vehicle_max_weight) * 100
    route['volume_percentage'] = (route['maxVolume'] / vehicle_max_volume) * 100
    route['working_hours_percentage'] = (route_time_hours / vehicle_working_hours) * 100

# Criar lista de pedidos únicos (excluindo o 0 que representa depósito)
pedidos_unicos = df_details[df_details['orderId'] != 0]['orderId'].unique().tolist()

# Criar lista de pedidos únicos (apenas pedidos em rota)
pedidos_unicos = sorted(csv_order_ids)  # Usando csv_order_ids que já contém apenas pedidos em rota
# Atualizar o dicionário janelas_tempo para incluir peso e volume
janelas_tempo = {}
if 'orders' in dados_transit and isinstance(dados_transit['orders'], list):
    for pedido in dados_transit['orders']:
        if isinstance(pedido, dict) and 'orderId' in pedido:
            delivery_tw = pedido.get('deliveryTW')
            pickup_tw = pedido.get('pickupTW')
            time_delivery = pedido.get('timeForDelivery', 0)
            time_pickup = pedido.get('timeForPickup', 0)
            minutes_items_delivery = pedido.get('minutesItemsDelivery', 0)
            minutes_items_pickup = pedido.get('minutesItemsPickup', 0)
            weight = pedido.get('weight', 0)  # Adicionando peso
            volume = pedido.get('volume', 0)  # Adicionando volume

            janelas_tempo[pedido['orderId']] = {
                'delivery': delivery_tw if delivery_tw else None,
                'pickup': pickup_tw if pickup_tw else None,
                'minutes_delivery': time_delivery,
                'minutes_pickup': time_pickup,
                'minutes_items_delivery': minutes_items_delivery,
                'minutes_items_pickup': minutes_items_pickup,
                'weight': weight,  # Novo campo
                'volume': volume   # Novo campo
            }
            json_order_ids.add(pedido['orderId'])

csv_order_ids = set(df_details[df_details['orderId'] != 0]['orderId'].unique())
pedidos_fora = json_order_ids - csv_order_ids
total_rotas = len(dados_summary)

# Adicionar função para formatar janela de tempo
def get_time_window_html(time_window):
    if not time_window:
        return "Não definido"
    try:
        # Se for um dicionário
        if isinstance(time_window, dict):
            return f"{time_window['start']} - {time_window['end']}"
        # Se for uma lista
        elif isinstance(time_window, list) and len(time_window) >= 2:
            return f"{time_window[0]} - {time_window[1]}"
        else:
            return "Formato inválido"
    except:
        return "Formato inválido"
# Extract optimization ID from the filename
import re

# Get the optimization ID from the zip filename or from the summary file
optimization_id = ""
if zip_filename and re.search(r'(\d+)_', zip_filename):
    optimization_id = re.search(r'(\d+)_', zip_filename).group(1)
else:
    # Try to get from the summary file name in file_contents
    for key, pattern in file_patterns.items():
        if key == 'summary':
            matching_files = [f for f in zip_ref.namelist() if f.endswith('_routes_summary_transitData.json')]
            if matching_files:
                match = re.search(r'(\d+)_routes_summary', matching_files[0])
                if match:
                    optimization_id = match.group(1)
                    break
# Print for debugging
print(f"Extracted optimization ID: {optimization_id}")
# Update the HTML template
# Adicionar função para calcular diferença de tempo (se ainda não existir)
# Atualizar a função para calcular diferença de tempo
def calculate_time_difference(start_time, end_time):
    # Verificar se os tempos são válidos
    try:
        # Extrair horas e minutos
        start_hours, start_minutes = map(int, start_time.split(':'))
        end_hours, end_minutes = map(int, end_time.split(':'))

        # Verificar se os valores estão dentro dos limites esperados
        if start_hours >= 24 or start_minutes >= 60 or end_hours >= 24 or end_minutes >= 60:
            return "Tempo inválido"

        # Calcular o tempo total em minutos
        start_total_minutes = start_hours * 60 + start_minutes
        end_total_minutes = end_hours * 60 + end_minutes

        # Calcular a diferença
        diff_minutes = end_total_minutes - start_total_minutes

        # Se for negativo, assumir que passou para o próximo dia
        if diff_minutes < 0:
            diff_minutes += 24 * 60

        # Converter para horas e minutos
        hours = diff_minutes // 60
        minutes = diff_minutes % 60

        return f"{hours}h {minutes}min"
    except:
        # Em caso de erro, retornar uma mensagem de erro
        return "Tempo inválido"
# Adicionar função para preparar dados do gráfico Gantt
# Melhorar a função prepare_gantt_data para formatar os dados corretamente
# Função para preparar os dados do gráfico Gantt para uma rota específica
def prepare_gantt_data(route_id):
    # Filtrar os dados da rota específica
    route_data = df_details[df_details['routeId'] == route_id]

    # Inicializar lista para armazenar os dados do Gantt
    gantt_data = []

    # Processar cada linha da rota
    for _, row in route_data.iterrows():
        # Pular a linha inicial (depósito) e final (retorno ao depósito)
        if row['type'] == 0:
            continue

        # Extrair o horário do formato "('HH:MM', 'HH:MM')"
        time_str = row['nodeDayHourRange']
        time_str = time_str.replace("('", "").replace("')", "").replace("', '", " - ")

        # Determinar o tipo de atividade (Coleta ou Entrega)
        activity_type = "Coleta" if row['type'] == 1 else "Entrega"

        # Adicionar dados à lista
        gantt_data.append({
            "Task": f"Pedido {row['orderId']}",
            "Start": time_str,
            "Resource": activity_type
        })

    return gantt_data
# Preparar dados de Gantt para todas as rotas
route_gantt_data = {}
unique_routes = df_details['routeId'].unique()
for route_id in unique_routes:
    # Converter numpy.int64 para int padrão do Python
    route_id_key = int(route_id) if hasattr(route_id, 'item') else route_id
    route_gantt_data[route_id_key] = prepare_gantt_data(route_id)
# Converter os dados de Gantt para JSON para uso no JavaScript
import json
route_gantt_json = json.dumps(route_gantt_data)
# Modificar a parte do template HTML que gera as caixas de rota
html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <title>Análise de Pedidos</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
    <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
    <style type="text/css">
        .tooltip {{
            position: relative;
            display: inline-flex;
            align-items: center;
        }}
        .tooltip:before {{
            content: attr(data-tooltip);
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            padding: 4px 8px;
            background-color: #1f2937;
            color: white;
            border-radius: 4px;
            font-size: 12px;
            white-space: nowrap;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.2s;
            z-index: 10;
        }}
        .tooltip:hover:before {{
            opacity: 1;
            visibility: visible;
        }}

        /* Estilos para o modal */
        .modal {{
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 50;
            overflow: auto;
        }}

        .modal-content {{
            background-color: white;
            margin: 5% auto;
            padding: 20px;
            width: 90%;
            max-width: 1200px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }}

        .close {{
            color: #aaa;
            float: right;
            font-size: 28px;
            font-weight: bold;
            cursor: pointer;
        }}
        .close:hover {{
            color: black;
        }}

        /* Estilo para o gráfico Gantt */
        #gantt-chart {{
            width: 100%;
            height: 600px;  /* Aumentado de 500px para 600px */
        }}
    </style>
</head>
<body class="bg-gray-100 font-['Inter']">
    <!-- Modal para o gráfico Gantt -->
    <div id="gantt-modal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal()">&times;</span>
            <h2 id="modal-title" class="text-2xl font-semibold mb-4">Cronograma de Entregas</h2>
            <div id="gantt-chart"></div>
        </div>
    </div>

    <div class="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
        <div class="max-w-7xl mx-auto space-y-8">
            <!-- Resumo/Visão Geral -->
            <div class="bg-white rounded-2xl shadow-lg p-6">
                <div class="border-b pb-4">
                    <h1 class="text-3xl font-semibold text-gray-800">Resumo/Visão Geral - ID Otimização: {optimization_id if optimization_id else "N/A"}</h1>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                    <div class="bg-blue-50 rounded-xl p-4">
                        <div class="text-blue-600 text-sm font-bold">Total de Pedidos</div>
                        <div class="text-2xl font-semibold mt-1 text-gray-900">{len(json_order_ids)}</div>
                    </div>
                    <div class="bg-green-50 rounded-xl p-4">
                        <div class="text-green-600 text-sm font-bold">Pedidos em Rota</div>
                        <div class="text-2xl font-semibold mt-1 text-gray-900">{len(csv_order_ids)}</div>
                    </div>
                    <div class="bg-purple-50 rounded-xl p-4">
                        <div class="text-purple-600 text-sm font-bold">Total de Rotas</div>
                        <div class="text-2xl font-semibold mt-1 text-gray-900">{total_rotas}</div>
                    </div>
                    <div class="bg-red-50 rounded-xl p-4">
                        <div class="text-red-600 text-sm font-bold">Pedidos Fora de Rota</div>
                        <div class="text-2xl font-semibold mt-1 text-gray-900">{len(pedidos_fora)}</div>
                    </div>
                </div>
            </div>

            <!-- Container para as três colunas -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                <!-- Visão Rotas -->
                <div class="bg-white rounded-2xl shadow-lg p-6 space-y-6">
                    <div class="border-b pb-4">
                        <h1 class="text-3xl font-semibold text-gray-800">Visão Rotas ({total_rotas})</h1>
                        {'''<div class="mt-2 inline-block px-2 py-0.5 rounded text-white text-xs font-bold" style="background-color: #e53d51;">Reotimização!</div>''' if any(route['vehicle']['maxWeight'] == 999999.99 and route['vehicle']['maxVolume'] == 999999.99 and route['vehicle']['workingHours'] == 99.0 for route in dados_summary) else ''}
                    </div>
                    <div class="grid grid-cols-1 gap-4">
                        {'''<div class="text-center text-gray-500 py-4">Nenhuma rota encontrada</div>''' if not dados_summary else '''
                        '''.join(f'''
                        <div class="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                            <!-- Conteúdo da rota -->
                            <div class="space-y-4">
                                <div class="flex justify-between items-center">
                                    <div class="text-lg text-gray-800 font-semibold cursor-pointer hover:text-blue-600" onclick="showGanttChart({idx})">Rota {idx + 1} ({route['nOrders']})</div>
                                    <div class="text-sm text-gray-500"><span class="font-bold">Veículo:</span> {route['vehicle']['id']}</div>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <div class="text-sm text-gray-600 font-bold flex items-center">
                                            Peso
                                            <span class="tooltip ml-1" data-tooltip="Capacidade máxima: {route['vehicle']['maxWeight']} Kg">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-4 h-4 text-gray-400">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </span>
                                        </div>
                                        <div class="flex items-center mt-1">
                                            <div class="flex-grow bg-gray-200 rounded-full h-2">
                                                <div class="bg-blue-600 rounded-full h-2" style="width: {int(round(route['weight_percentage']))}%"></div>
                                            </div>
                                            <span class="text-sm text-gray-600 ml-2">{int(round(route['weight_percentage']))}%</span>
                                        </div>
                                    </div>
                                    <div>
                                        <div class="text-sm text-gray-600 font-bold flex items-center">
                                            Volume
                                            <span class="tooltip ml-1" data-tooltip="Capacidade máxima: {route['vehicle']['maxVolume']} m³">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-4 h-4 text-gray-400">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </span>
                                        </div>
                                        <div class="flex items-center mt-1">
                                            <div class="flex-grow bg-gray-200 rounded-full h-2">
                                                <div class="bg-green-600 rounded-full h-2" style="width: {int(round(route['volume_percentage']))}%"></div>
                                            </div>
                                            <span class="text-sm text-gray-600 ml-2">{int(round(route['volume_percentage']))}%</span>
                                        </div>
                                    </div>
                                    <div>
                                        <div class="text-sm text-gray-600 font-bold flex items-center">
                                            Tempo
                                            <span class="tooltip ml-1" data-tooltip="Jornada de trabalho: {route['vehicle']['workingHours']} horas">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-4 h-4 text-gray-400">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </span>
                                        </div>
                                        <div class="flex items-center mt-1">
                                            <div class="flex-grow bg-gray-200 rounded-full h-2">
                                                <div class="bg-purple-600 rounded-full h-2" style="width: {int(round(route['working_hours_percentage']))}%"></div>
                                            </div>
                                            <span class="text-sm text-gray-600 ml-2">{int(round(route['working_hours_percentage']))}%</span>
                                        </div>
                                    </div>
                                </div>
                                <div class="grid grid-cols-1 gap-4 mt-2">
                                    <div class="flex items-center space-x-2 justify-between bg-gray-50 p-2 rounded-lg">
                                        <span class="text-sm text-gray-600"><span class="font-bold">Início:</span> {route['routeStartDayHourRange'][0]}</span>
                                        <span class="text-sm text-gray-600">|</span>
                                        <span class="text-sm text-gray-600"><span class="font-bold">Fim:</span> {route['routeEndDayHourRange'][0]}</span>
                                        <span class="text-sm text-gray-600">|</span>
                                        <span class="text-sm text-gray-600"><span class="font-bold">Total:</span> {calculate_time_difference(route['routeStartDayHourRange'][0], route['routeEndDayHourRange'][0])}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        ''' for idx, route in enumerate(dados_summary))}
                    </div>
                </div>

                <!-- Visão Pedidos -->
                <div class="bg-white rounded-2xl shadow-lg p-6 space-y-6">
                    <div class="border-b pb-4">
                        <h1 class="text-3xl font-semibold text-gray-800">Visão Pedidos ({len(csv_order_ids)})</h1>
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
                        {'''
                        '''.join(f'''
                        <div class="bg-white border border-gray-200 rounded-xl hover:shadow-md transition-shadow">
                            <button onclick="toggleAccordion('accordion-{pedido}')" class="w-full p-4 text-left flex justify-between items-center">
                                <div class="text-lg text-gray-800 font-semibold">Pedido: {pedido}</div>
                                <svg id="icon-{pedido}" class="w-6 h-6 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                            <div id="accordion-{pedido}" class="hidden p-4 pt-0">
                                <div class="space-y-2">
                                    <div class="flex items-center space-x-2">
                                        <span class="text-sm text-gray-600 font-bold">Peso:</span>
                                        <span class="text-sm font-medium text-black">
                                            {janelas_tempo.get(pedido, {}).get('weight', 0):.2f} Kg
                                        </span>
                                    </div>
                                    <div class="flex items-center space-x-2">
                                        <span class="text-sm text-gray-600 font-bold">Volume:</span>
                                        <span class="text-sm font-medium text-black">
                                            {janelas_tempo.get(pedido, {}).get('volume', 0):.2f} m³
                                        </span>
                                    </div>
                                    <div class="flex items-center space-x-2">
                                        <span class="text-sm text-gray-600 font-bold">Jan. de Tempo Entrega:</span>
                                        <span class="text-sm font-medium text-black">
                                            {get_time_window_html(janelas_tempo.get(pedido, {}).get('delivery'))}
                                        </span>
                                    </div>
                                    <div class="flex items-center space-x-2">
                                        <span class="text-sm text-gray-600 font-bold">Jan. de Tempo Coleta:</span>
                                        <span class="text-sm font-medium text-black">
                                            {get_time_window_html(janelas_tempo.get(pedido, {}).get('pickup'))}
                                        </span>
                                    </div>
                                    <div class="flex items-center space-x-2">
                                        <span class="text-sm text-gray-600 font-bold">Minutos por pedido entrega:</span>
                                        <span class="text-sm font-medium text-black">
                                            {janelas_tempo.get(pedido, {}).get('minutes_delivery', 0)}
                                        </span>
                                    </div>
                                    <div class="flex items-center space-x-2">
                                        <span class="text-sm text-gray-600 font-bold">Minutos por pedido coleta:</span>
                                        <span class="text-sm font-medium text-black">
                                            {janelas_tempo.get(pedido, {}).get('minutes_pickup', 0)}
                                        </span>
                                    </div>
                                    <div class="flex items-center space-x-2">
                                        <span class="text-sm text-gray-600 font-bold">Minutos por item entrega:</span>
                                        <span class="text-sm font-medium text-black">
                                            {janelas_tempo.get(pedido, {}).get('minutes_items_delivery', 0)}
                                        </span>
                                    </div>
                                    <div class="flex items-center space-x-2">
                                        <span class="text-sm text-gray-600 font-bold">Minutos por item coleta:</span>
                                        <span class="text-sm font-medium text-black">
                                            {janelas_tempo.get(pedido, {}).get('minutes_items_pickup', 0)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        ''' for pedido in sorted(csv_order_ids))}
                    </div>
                </div>

                <!-- Pedidos Fora de Rota -->
                <div class="bg-white rounded-2xl shadow-lg p-6 space-y-6">
                    <div class="border-b pb-4">
                        <h1 class="text-3xl font-semibold text-gray-800">Pedidos Fora de Rota ({len(pedidos_fora)})</h1>
                    </div>
                    <div class="grid grid-cols-1 gap-4">
                        {'''
                        '''.join(f'''
                        <div class="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                            <div class="flex justify-between items-center">
                                <div class="text-lg text-gray-800 font-semibold">Pedido: {pedido}</div>
                            </div>
                            <div class="mt-2 space-y-2">
                                <div class="flex items-center space-x-2">
                                    <span class="text-sm text-gray-600 font-bold">Peso:</span>
                                    <span class="text-sm font-medium text-black">
                                        {janelas_tempo.get(pedido, {}).get('weight', 0):.2f} Kg
                                    </span>
                                    {'<span class="ml-2 text-xs font-bold px-1 py-0.5 bg-yellow-200 rounded tooltip" style="color: #e53d51;" data-tooltip="Possível ofensor">&lt;&lt; Atenção</span>' if janelas_tempo.get(pedido, {}).get('weight', 0) > 20 else ''}
                                </div>
                                <div class="flex items-center space-x-2">
                                    <span class="text-sm text-gray-600 font-bold">Volume:</span>
                                    <span class="text-sm font-medium text-black">
                                        {janelas_tempo.get(pedido, {}).get('volume', 0):.2f} m³
                                    </span>
                                </div>
                                <div class="flex items-center space-x-2">
                                    <span class="text-sm text-gray-600 font-bold">Jan. de Tempo Entrega:</span>
                                    <span class="text-sm font-medium text-black">
                                        {get_time_window_html(janelas_tempo.get(pedido, {}).get('delivery'))}
                                    </span>
                                    {'<span class="ml-2 text-xs font-bold px-1 py-0.5 bg-yellow-200 rounded tooltip" style="color: #e53d51;" data-tooltip="Possível ofensor">&lt;&lt; Atenção</span>' if get_time_window_html(janelas_tempo.get(pedido, {}).get('delivery')) != "Não definido" else ''}
                                </div>
                                <div class="flex items-center space-x-2">
                                    <span class="text-sm text-gray-600 font-bold">Jan. de Tempo Coleta:</span>
                                    <span class="text-sm font-medium text-black">
                                        {get_time_window_html(janelas_tempo.get(pedido, {}).get('pickup'))}
                                    </span>
                                    {'<span class="ml-2 text-xs font-bold px-1 py-0.5 bg-yellow-200 rounded tooltip" style="color: #e53d51;" data-tooltip="Possível ofensor">&lt;&lt; Atenção</span>' if get_time_window_html(janelas_tempo.get(pedido, {}).get('pickup')) != "Não definido" else ''}
                                </div>
                                <div class="flex items-center space-x-2">
                                    <span class="text-sm text-gray-600 font-bold">Minutos por pedido entrega:</span>
                                    <span class="text-sm font-medium text-black">
                                        {janelas_tempo.get(pedido, {}).get('minutes_delivery', 0)}
                                    </span>
                                </div>
                                <div class="flex items-center space-x-2">
                                    <span class="text-sm text-gray-600 font-bold">Minutos por pedido coleta:</span>
                                    <span class="text-sm font-medium text-black">
                                        {janelas_tempo.get(pedido, {}).get('minutes_pickup', 0)}
                                    </span>
                                </div>
                                <div class="flex items-center space-x-2">
                                    <span class="text-sm text-gray-600 font-bold">Minutos por item entrega:</span>
                                    <span class="text-sm font-medium text-black">
                                        {janelas_tempo.get(pedido, {}).get('minutes_items_delivery', 0)}
                                    </span>
                                </div>
                                <div class="flex items-center space-x-2">
                                    <span class="text-sm text-gray-600 font-bold">Minutos por item coleta:</span>
                                    <span class="text-sm font-medium text-black">
                                        {janelas_tempo.get(pedido, {}).get('minutes_items_pickup', 0)}
                                    </span>
                                </div>
                            </div>
                        </div>
                        ''' for pedido in sorted(pedidos_fora))}
                    </div>
                </div>
            </div>
        </div>
    </div>
    <script>
        function toggleAccordion(id) {{
            const content = document.getElementById(id);
            const icon = document.getElementById('icon-' + id.split('-')[1]);

            if (content.classList.contains('hidden')) {{
                content.classList.remove('hidden');
                icon.classList.add('rotate-180');
            }} else {{
                content.classList.add('hidden');
                icon.classList.remove('rotate-180');
            }}
        }}

        function toggleAllAccordions(show) {{
            const accordions = document.querySelectorAll('[id^="accordion-"]');
            const icons = document.querySelectorAll('[id^="icon-"]');

            accordions.forEach(acc => {{
                if (show) {{
                    acc.classList.remove('hidden');
                }} else {{
                    acc.classList.add('hidden');
                }}
            }});

            icons.forEach(icon => {{
                if (show) {{
                    icon.classList.add('rotate-180');
                }} else {{
                    icon.classList.remove('rotate-180');
                }}
            }});
        }}

        // Dados de Gantt para todas as rotas
        const routeGanttData = {route_gantt_json};

        // Função para mostrar o modal com o gráfico Gantt
        function showGanttChart(routeIndex) {{
            const modal = document.getElementById('gantt-modal');
            const modalTitle = document.getElementById('modal-title');

            // Definir o título do modal
            modalTitle.textContent = 'Cronograma de Entregas - Rota ' + (routeIndex + 1);

            // Mostrar o modal
            modal.style.display = 'block';
            // Criar o gráfico Gantt
            createGanttChart(routeIndex);
        }}
        // Função para fechar o modal
        function closeModal() {{
            const modal = document.getElementById('gantt-modal');
            modal.style.display = 'none';
        }}
        
        // Função para criar o gráfico Gantt
        function createGanttChart(routeIndex) {{
            // Obter os dados da rota
            const route = JSON.parse('{json.dumps(dados_summary)}')[routeIndex];
            
            // Verificar se route existe
            if (!route) {{
                document.getElementById('gantt-chart').innerHTML =
                    '<div class="text-center text-gray-500 py-4">Dados da rota não encontrados</div>';
                return;
            }}
            
            // Usar route.id ou route.route_id ou o índice como fallback
            const routeId = route.id || route.route_id || routeIndex;
            const ganttData = routeGanttData[routeId] || [];

            if (ganttData.length > 0) {{
                // Preparar dados para o Plotly
                const tasks = ganttData.map(item => item.Task);
                const startTimes = ganttData.map(item => item.Start);
                const resources = ganttData.map(item => item.Resource);

                // Definir cores com base no tipo de atividade
                const colors = resources.map(resource =>
                    resource === 'Entrega' ? 'rgb(54, 162, 235)' : 'rgb(255, 99, 132)'
                );
                // Reorganizar os dados para que o Pedido 0 apareça no começo
                // Encontrar o índice do Pedido 0 (se existir)
                const pedido0Index = tasks.findIndex(task => task.includes('Pedido 0'));

                // Se o Pedido 0 existir, reorganizar os arrays
                let orderedTasks = [...tasks];
                let orderedStartTimes = [...startTimes];
                let orderedResources = [...resources];
                let orderedColors = [...colors];

                if (pedido0Index !== -1) {{
                    // Mover o Pedido 0 para o início
                    orderedTasks = [tasks[pedido0Index], ...tasks.slice(0, pedido0Index), ...tasks.slice(pedido0Index + 1)];
                    orderedStartTimes = [startTimes[pedido0Index], ...startTimes.slice(0, pedido0Index), ...startTimes.slice(pedido0Index + 1)];
                    orderedResources = [resources[pedido0Index], ...resources.slice(0, pedido0Index), ...resources.slice(pedido0Index + 1)];
                    orderedColors = [colors[pedido0Index], ...colors.slice(0, pedido0Index), ...colors.slice(pedido0Index + 1)];
                }}

                // Criar o gráfico
                const data = [{{
                    x: orderedStartTimes,
                    y: orderedTasks,
                    mode: 'markers+lines',
                    type: 'scatter',
                    marker: {{
                        color: orderedColors,
                        size: 12,
                        symbol: 'circle'
                    }},
                    line: {{
                        color: 'rgba(150, 150, 150, 0.3)',
                        width: 2,
                        dash: 'dot'
                    }},
                    text: orderedResources.map((resource, i) =>
                        `${{orderedTasks[i]}}<br>Horário: ${{orderedStartTimes[i]}}<br>Tipo: ${{resource}}`
                    ),
                    hoverinfo: 'text'
                }}];

                const layout = {{
                    title: '',
                    height: 600,
                    margin: {{ l: 50, r: 20, t: 10, b: 40 }},  // Aumentei a margem esquerda para acomodar o título
                    xaxis: {{
                        title: 'Horário',
                        showgrid: true,
                        zeroline: false
                    }},
                    yaxis: {{
                        title: 'Pedidos',  // Adicionado o título do eixo Y
                        showticklabels: false,  // Mantido false para ocultar os labels específicos
                        showgrid: true,
                        autorange: "reversed"  // Mantido para que o Ponto 0 comece no topo
                    }}
                }};
                const config = {{
                    displayModeBar: false,
                    responsive: true
                }};

                Plotly.newPlot('gantt-chart', data, layout, config);
            }} else {{
                // Se não houver dados, exibir mensagem
                document.getElementById('gantt-chart').innerHTML =
                    '<div class="text-center text-gray-500 py-4">Sem dados de cronograma disponíveis</div>';
            }}
        }}
        // Fechar o modal quando clicar fora dele
        window.onclick = function(event) {{
            const modal = document.getElementById('gantt-modal');
            if (event.target == modal) {{
                modal.style.display = 'none';
            }}
        }}
    </script>
</body>
</html>
"""

# Exibir o HTML
display(HTML(html_content))