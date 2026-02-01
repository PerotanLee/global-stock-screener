// Watchlist Chart Feature Implementation
// This file contains functions for watchlist chart display

// Create expandable chart view for watchlist items
function createWatchlistChart(symbol, container) {
    const chartId = `wl-chart-${symbol.replace(/[^a-zA-Z0-9]/g, '')}`;

    const chartHTML = `
        <div class="wl-chart-section" id="chart-sec-${symbol.replace(/[^a-zA-Z0-9]/g, '')}" style="display:none;margin-top:10px">
            <div class="chart-controls" style="display:flex;gap:8px;margin-bottom:10px">
                <button class="range-btn-sm active" data-range="1D" data-symbol="${symbol}">1D</button>
                <button class="range-btn-sm" data-range="1W" data-symbol="${symbol}">1W</button>
                <button class="range-btn-sm" data-range="1M" data-symbol="${symbol}">1M</button>
                <button class="range-btn-sm" data-range="3M" data-symbol="${symbol}">3M</button>
                <button class="range-btn-sm" data-range="1Y" data-symbol="${symbol}">1Y</button>
            </div>
            <div style="position:relative;height:200px">
                <canvas id="${chartId}"></canvas>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', chartHTML);

    // Add event listeners for range buttons
    document.querySelectorAll(`.range-btn-sm[data-symbol="${symbol}"]`).forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll(`.range-btn-sm[data-symbol="${symbol}"]`).forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            await loadWatchlistStockChart(symbol, btn.dataset.range);
        });
    });

    // Initial load with 1Y
    loadWatchlistStockChart(symbol, '1Y');
}

// Toggle chart visibility
function toggleWatchlistChart(symbol) {
    const chartId = `chart-sec-${symbol.replace(/[^a-zA-Z0-9]/g, '')}`;
    const chartSection = document.getElementById(chartId);

    if (!chartSection) {
        // Chart doesn't exist, create it
        const container = document.querySelector(`[data-wl-symbol="${symbol}"]`);
        if (container) {
            createWatchlistChart(symbol, container);
        }
    } else {
        // Toggle visibility
        chartSection.style.display = chartSection.style.display === 'none' ? 'block' : 'none';
    }
}

// Load chart data for watchlist stock
async function loadWatchlistStockChart(symbol, range) {
    const chartId = `wl-chart-${symbol.replace(/[^a-zA-Z0-9]/g, '')}`;
    const canvas = document.getElementById(chartId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Destroy existing chart
    const cleanSymbol = symbol.replace(/[^a-zA-Z0-9]/g, '');
    if (state.wlCharts[cleanSymbol]) {
        state.wlCharts[cleanSymbol].destroy();
    }

    // Get chart data based on range
    let chartData = [];
    switch (range) {
        case '1D':
            chartData = await getCandles(symbol, 1);
            break;
        case '1W':
            chartData = await getCandles(symbol, 7);
            break;
        case '1M':
            chartData = await getCandles(symbol, 30);
            break;
        case '3M':
            chartData = await getCandles(symbol, 90);
            break;
        case '1Y':
        default:
            chartData = await getCandles(symbol, 365);
    }

    if (chartData.length === 0) {
        ctx.fillStyle = '#888';
        ctx.font = '12px Inter';
        ctx.fillText('データなし', 10, 100);
        return;
    }

    // Create chart
    state.wlCharts[cleanSymbol] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.map(c => new Date(c.time).toLocaleDateString('ja-JP', {
                month: 'short', day:

                    'numeric'
            })),
            datasets: [{
                data: chartData.map(c => c.close),
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 0,
                pointHoverRadius: 4,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: (context) => `$${context.parsed.y.toFixed(2)}`
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    ticks: { maxTicksLimit: 6, color: '#888' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    position: 'right',
                    ticks: { color: '#888' },
                    grid: { color: 'rgba(255,255,255,0.1)' }
                }
            }
        }
    });
}

// Perplexity AI Q&A Feature
// Perplexity AI Vision Ticker Extraction
async function extractTickersFromImageWithPerplexity(base64Image) {
    if (!state.perplexityKey) return [];

    try {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.perplexityKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'sonar',
                messages: [
                    {
                        role: 'system',
                        content: `You are a financial data analysis expert. 
                        
                        TASK: Extract all stock ticker symbols explicitly represented in the image.
                        
                        RULES:
                        1. Scan the Symbol and Company Name columns.
                        2. Use your knowledge to map company names to tickers correctly (e.g., "PayPal" to "PYPL").
                        3. CRITICAL: DO NOT add "related" tickers that are not present in the image. For example, if you see Micron (MU), DO NOT add Western Digital (WDC) or TSM unless they are also shown.
                        4. Output ONLY a clean JSON array of strings. No extra text, no repetitions.
                        Example: ["MU", "CIEN", "PYPL"]`
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: "Identify all stock tickers in this image and list them as a JSON array. Do not include any stocks not explicitly shown."
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: base64Image
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 300,
                temperature: 0.0
            })
        });

        if (!response.ok) return [];

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        let tickers = [];
        try {
            const start = content.indexOf('[');
            const end = content.lastIndexOf(']');
            if (start !== -1 && end !== -1) {
                tickers = JSON.parse(content.substring(start, end + 1));
            } else {
                throw new Error('No JSON found');
            }
        } catch (e) {
            tickers = content.match(/\b[A-Z0-9.]{1,8}\b/g) || [];
        }

        const blacklist = ['FWD', 'EPS', 'AVG', 'TOTAL', 'SOURCE', 'ALPHA', 'LSEG', 'FACTSET', 'GROWTH', 'RATE', 'USD', 'S&P', '500', 'INDEX', 'SYMBOL', 'COMPANY', 'NAME', 'REVENUE', 'MAG', 'TOP', '7'];

        const finalTickers = [...new Set(tickers)]
            .map(t => typeof t === 'string' ? t.trim().toUpperCase() : '')
            .filter(t => t && t.length >= 1 && t.length <= 8)
            .filter(t => !blacklist.includes(t))
            .filter(t => /^[A-Z0-9.]+$/.test(t));

        return finalTickers;
    } catch (error) {
        console.error('Vision extraction error:', error);
        return [];
    }
}

// Perplexity AI Ticker Extraction from messy OCR text
async function extractTickersFromTextWithAI(text) {
    if (!state.perplexityKey) return [];

    try {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.perplexityKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'sonar',
                messages: [
                    {
                        role: 'system',
                        content: `You are a financial data expert. Your task is to extract stock tickers from messy OCR text.
                        RULES:
                        1. Identify all stock TICKERS (e.g., MU, AAPL) and COMPANY NAMES (e.g., Micron Technology, Ciena) explicitly or implicitly present.
                        2. If you find a COMPANY NAME, map it to its corresponding STOCK TICKER symbol.
                        3. If the text looks like a table with columns like "Symbol" and "Company Name", use both to ensure correct ticker extraction.
                        4. Output ONLY a COMMA-SEPARATED LIST of the identified/mapped ticker symbols.
                        5. DO NOT include generic terms like FWD, EPS, AVG, DATE, INDEX, 500.
                        6. Output 'NONE' if no financial entities are found.`
                    },
                    {
                        role: "user",
                        content: `OCR Text: ${text}`
                    }
                ],
                temperature: 0.0,
                max_tokens: 150
            })
        });

        if (!response.ok) return [];

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        if (content.toUpperCase().includes('NONE')) return [];

        const blacklist = ['FWD', 'EPS', 'AVG', 'TOTAL', 'SOURCE', 'ALPHA', 'LSEG', 'FACTSET', 'GROWTH', 'RATE', 'USD', 'S&P', '500', 'INDEX', 'SYMBOL', 'COMPANY', 'NAME', 'REVENUE'];

        const tickers = content.split(/[,\s]+/)
            .map(t => t.trim().replace(/[()[\]{}]/g, '').toUpperCase())
            .filter(t => t && t.length >= 1 && t.length <= 10)
            .filter(t => !blacklist.includes(t))
            .filter(t => /^[A-Z0-9.]+$/.test(t));

        return [...new Set(tickers)];
    } catch (error) {
        console.error('Extraction error:', error);
        return [];
    }
}

// Export functions to window
window.askPerplexityAI = askPerplexityAI;
window.extractTickersFromTextWithAI = extractTickersFromTextWithAI;
window.extractTickersFromImageWithPerplexity = extractTickersFromImageWithPerplexity;
async function askPerplexityAI(question, stockSymbol, stockData) {
    if (!state.perplexityKey) {
        return 'Perplexity APIキーが設定されていません。設定から追加してください。';
    }

    try {
        const context = `株式情報:
- ティッカーシンボル: ${stockSymbol}
- 現在価格: $${stockData.quote?.price || 'N/A'}
- 変動率: ${stockData.quote?.changePercent?.toFixed(2) || 'N/A'}%
- AIアドバイス: ${stockData.verdict}
- モメンタムスコア: ${stockData.scores?.mom || 0}/100
- ファンダメンタルスコア: ${stockData.scores?.fund || 0}/100
- センチメントスコア: ${stockData.scores?.sent || 0}/100

ユーザーの質問: ${question}

上記の株式情報を基に、最新の市場動向も考慮して日本語で簡潔かつ専門的に回答してください。`;

        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.perplexityKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'sonar',
                messages: [
                    {
                        role: 'system',
                        content: 'あなたは株式投資の専門家です。最新の市場情報を参照しながら、正確で役立つアドバイスを日本語で提供します。'
                    },
                    {
                        role: 'user',
                        content: context
                    }
                ],
                temperature: 0.2,
                max_tokens: 1000
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Perplexity API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || '回答を生成できませんでした。';
    } catch (error) {
        console.error('Perplexity AI error:', error);
        return `エラーが発生しました: ${error.message}`;
    }
}
