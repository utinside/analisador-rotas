# Analisador de Rotas

Este é um projeto para análise de rotas de entrega, desenvolvido para ser hospedado no GitHub Pages. O projeto permite que você faça upload de arquivos ZIP contendo dados de rotas e visualize informações detalhadas sobre as entregas, incluindo:

- Visão geral das rotas
- Detalhes dos pedidos
- Pedidos fora de rota
- Gráficos Gantt para visualização do cronograma

## Como Usar

1. Acesse a página do projeto no GitHub Pages
2. Faça upload de um arquivo ZIP contendo os seguintes arquivos:
   - `*_transitData.json`
   - `*_routes_details_transitData.csv`
   - `*_routes_summary_transitData.json`

3. O sistema irá processar automaticamente os arquivos e exibir:
   - Uma visão geral com estatísticas
   - Detalhes de cada rota
   - Informações sobre pedidos
   - Gráficos Gantt para visualização do cronograma

## Funcionalidades

### Visão Rotas
- Número total de rotas
- Detalhes de cada rota incluindo:
  - Capacidade de peso
  - Capacidade de volume
  - Tempo de trabalho
  - Horários de início e fim
  - Gráfico Gantt interativo

### Visão Pedidos
- Lista detalhada de todos os pedidos
- Informações por pedido:
  - Peso
  - Volume
  - Janelas de tempo
  - Tempos de processamento

### Pedidos Fora de Rota
- Lista de pedidos não incluídos em rotas
- Alertas para possíveis problemas
- Detalhes completos de cada pedido

## Tecnologias Utilizadas

- HTML5
- CSS3 (Tailwind CSS)
- JavaScript (Vanilla)
- Plotly.js para gráficos
- Papa Parse para processamento de CSV
- JSZip para processamento de arquivos ZIP

## Como Desenvolver Localmente

1. Clone o repositório
2. Abra o arquivo `index.html` em um navegador moderno
3. Para desenvolvimento, recomenda-se usar um servidor local para evitar problemas de CORS

## Estrutura do Projeto

```
.
├── index.html          # Página principal
├── js/
│   └── script.js      # Lógica principal do aplicativo
└── README.md          # Este arquivo
```

## Requisitos do Navegador

- Navegador moderno com suporte a JavaScript ES6+
- Suporte a drag and drop de arquivos
- JavaScript habilitado
- Cookies habilitados (para algumas funcionalidades)

## Contribuindo

Contribuições são bem-vindas! Por favor, sinta-se à vontade para:

1. Fazer um fork do projeto
2. Criar uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abrir um Pull Request

## Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo LICENSE para detalhes. 