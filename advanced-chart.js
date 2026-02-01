// Advanced Chart for Global Stock Screener
// Working version with proper state.events integration

(function () {
    'use strict';

    // Utility: Format numbers
    function formatNumber(num) {
        if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
        if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
        if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
        return num?.toFixed(0) || '0';
    }

    // Main render function
    window.renderModalChart = async function (symbol, range) {
        console.log(`📊 renderModalChart called: ${symbol}, ${range}`);
        const canvas = document.getElementById('modal-chart');
        if (!canvas) return;

        // Destroy existing chart
        const existing = Chart.getChart(canvas);
        if (existing) existing.destroy();

        // 1. Get data from global cache (provided by fetchUnifiedData in index.html)
        const cache = window.state?.chartCache?.[symbol];
        if (!cache || !cache.chart || cache.chart.length === 0) {
            console.warn('⚠️ No cached data found for', symbol);
            return;
        }

        const fullChart = cache.chart;
        const fullEvents = cache.events || [];

        // 2. Filter data by range
        const now = fullChart[fullChart.length - 1].time;
        let filteredChart = [];
        let timeThreshold = 0;

        if (range === '1D') timeThreshold = now - 24 * 60 * 60 * 1000;
        else if (range === '1W') timeThreshold = now - 7 * 24 * 60 * 60 * 1000;
        else if (range === '1M') timeThreshold = now - 31 * 24 * 60 * 60 * 1000;
        else if (range === '3M') timeThreshold = now - 92 * 24 * 60 * 60 * 1000;
        else if (range === '6M') timeThreshold = now - 183 * 24 * 60 * 60 * 1000;
        else timeThreshold = 0; // 1Y or all

        filteredChart = fullChart.filter(d => d.time >= timeThreshold);

        // Map to Chart.js format
        const chartData = filteredChart.map(d => ({ x: d.time, y: d.close }));
        const volumeData = filteredChart.map((d, i) => {
            const prev = filteredChart[i - 1]?.close || d.close;
            return {
                x: d.time,
                y: d.volume,
                color: d.close >= prev ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)'
            };
        });

        // 3. Events Deduplication (Already mostly done in index.html, but let's be safe)
        const events = fullEvents.filter(e => {
            const ets = new Date(e.date).getTime();
            return ets >= timeThreshold;
        });

        console.log(`✅ Cached Render: ${chartData.length} pts, ${events.length} events`);

        if (chartData.length === 0) {
            console.error('❌ No chart data available, aborting');
            return;
        }

        console.log(`📈 Rendering chart: ${chartData.length} points, ${events.length} events`);

        // Helper for SMA
        function calculateSMA(data, period) {
            const result = [];
            for (let i = 0; i < data.length; i++) {
                if (i < period - 1) {
                    result.push({ x: data[i].x, y: null });
                    continue;
                }
                const slice = data.slice(i - period + 1, i + 1);
                const avg = slice.reduce((sum, d) => sum + d.y, 0) / period;
                result.push({ x: data[i].x, y: avg });
            }
            return result;
        }

        // Build dataset
        const datasets = [{
            label: symbol,
            data: chartData,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            borderWidth: 2,
            fill: true,
            pointRadius: 0,
            tension: 0.1,
            yAxisID: 'y',
            order: 0 // Always on top
        }];

        // MA20
        if (document.getElementById('opt-ma20')?.checked) {
            datasets.push({
                label: 'MA20',
                data: calculateSMA(chartData, 20),
                borderColor: 'rgba(245, 158, 11, 0.8)',
                borderWidth: 1.5,
                pointRadius: 0,
                fill: false,
                tension: 0.1
            });
        }

        // MA50
        if (document.getElementById('opt-ma50')?.checked) {
            datasets.push({
                label: 'MA50',
                data: calculateSMA(chartData, 50),
                borderColor: 'rgba(139, 92, 246, 0.8)',
                borderWidth: 1.5,
                pointRadius: 0,
                fill: false,
                tension: 0.1
            });
        }

        // Volume
        if (document.getElementById('opt-volume')?.checked && volumeData.length > 0) {
            datasets.push({
                label: 'Volume',
                type: 'bar',
                data: volumeData.map(d => ({ x: d.x, y: d.y })),
                backgroundColor: volumeData.map(v => v.color),
                yAxisID: 'y1',
                barThickness: 'flex',
                maxBarThickness: 4,
                order: 2 // Place behind lines
            });
        }

        // Index Comparison (S&P 500 & Nasdaq)
        if (document.getElementById('opt-index')?.checked) {
            window.indexCache = window.indexCache || {};
            const indices = [
                { symbol: '^GSPC', label: 'S&P 500', color: 'rgba(148, 163, 184, 0.6)' },
                { symbol: '^IXIC', label: 'Nasdaq', color: 'rgba(232, 121, 249, 0.6)' }
            ];

            for (const index of indices) {
                try {
                    const cacheKey = `${index.symbol}_${range}`; // Use the passed range
                    let indexResult = window.indexCache[cacheKey];

                    if (!indexResult) {
                        const yahooRange = range === '1D' ? '1d' : (range === '1W' ? '5d' : (range === '1M' ? '1mo' : (range === '3M' ? '3mo' : (range === '6M' ? '6mo' : '1y'))));
                        const indexUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(index.symbol)}?range=${yahooRange}&interval=1d`;
                        const indexDataRaw = await window.proxyFetch(indexUrl);
                        indexResult = indexDataRaw?.chart?.result?.[0];
                        if (indexResult) window.indexCache[cacheKey] = indexResult;
                    }

                    if (indexResult && indexResult.timestamp) {
                        const ts = indexResult.timestamp;
                        const quotes = indexResult.indicators?.quote?.[0];
                        if (!quotes?.close) continue;

                        const close = quotes.close;
                        const firstPrice = close.find(p => p != null);
                        const firstStockPrice = chartData[0]?.y;

                        if (firstPrice && firstStockPrice) {
                            const normalizedData = ts.map((t, i) => ({
                                x: t * 1000,
                                y: close[i] ? (close[i] / firstPrice) * firstStockPrice : null
                            })).filter(d => d.y != null);

                            datasets.push({
                                label: index.label,
                                data: normalizedData,
                                borderColor: index.color,
                                borderWidth: 1.5,
                                borderDash: [4, 4],
                                pointRadius: 0,
                                fill: false,
                                tension: 0.1,
                                order: 1
                            });
                        }
                    }
                } catch (e) {
                    console.warn(`Index ${index.symbol} fetch failed`, e);
                }
            }
        }

        // Create event annotations
        const annotations = {};
        const eventsCheckbox = document.getElementById('opt-events');

        if (eventsCheckbox?.checked && events.length > 0) {
            const xMin = chartData[0]?.x;
            const xMax = chartData[chartData.length - 1]?.x;

            let annotationCount = 0;
            events.forEach((e, i) => {
                if (!e.date) return;
                const eventDate = new Date(e.date).getTime();

                // Filter events - only show events within chart data range
                if (eventDate < xMin || eventDate > xMax) return;

                const isEarnings = e.type === 'earnings';
                annotations[`evt${i}`] = {
                    type: 'line',
                    scaleID: 'x',
                    value: eventDate,
                    borderColor: isEarnings ? 'rgba(236, 72, 153, 0.9)' : 'rgba(16, 185, 129, 0.9)',
                    borderWidth: 2,
                    borderDash: [4, 4],
                    label: {
                        content: isEarnings ? '📊' : '💰',
                        display: true,
                        position: 'start',
                        backgroundColor: isEarnings ? 'rgba(236, 72, 153, 0.9)' : 'rgba(16, 185, 129, 0.9)',
                        color: '#ffffff',
                        font: { size: 12, weight: 'bold' },
                        padding: 3,
                        borderRadius: 3
                    }
                };
                annotationCount++;
            });
            console.log(`🎯 Created ${annotationCount} annotations`);
        } else {
            if (!eventsCheckbox?.checked) {
                console.log('⏸️ Events checkbox not checked');
            }
        }

        // Render chart
        try {
            new Chart(canvas, {
                type: 'line',
                data: { datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    interaction: { intersect: false, mode: 'index' },
                    plugins: {
                        legend: { display: false },
                        annotation: {
                            annotations: annotations,
                            clip: false
                        },
                        tooltip: {
                            backgroundColor: 'rgba(17, 24, 39, 0.95)',
                            titleColor: '#f1f5f9',
                            bodyColor: '#94a3b8',
                            borderColor: 'rgba(255,255,255,0.1)',
                            borderWidth: 1,
                            callbacks: {
                                label: (ctx) => `${ctx.dataset.label}: $${ctx.parsed.y.toFixed(2)}`
                            }
                        }
                    },
                    scales: {
                        x: {
                            type: 'time',
                            time: {
                                unit: range === '1D' ? 'hour' : (range === '1W' ? 'day' : 'month'),
                                displayFormats: {
                                    hour: 'HH:mm',
                                    day: 'MM/dd',
                                    month: 'MM/dd'
                                }
                            },
                            grid: { color: 'rgba(255,255,255,0.04)' },
                            ticks: { color: '#64748b', font: { size: 10 } }
                        },
                        y: {
                            position: 'right',
                            grid: { color: 'rgba(255,255,255,0.04)' },
                            ticks: { color: '#64748b', font: { size: 10 } }
                        },
                        y1: {
                            position: 'right',
                            display: false,
                            grid: { display: false },
                            min: 0,
                            suggestedMax: (() => {
                                const maxVol = Math.max(...volumeData.map(v => v.y), 0);
                                return maxVol * 4; // Volume takes bottom 25%
                            })()
                        }
                    }
                }
            });
            console.log('✅ Chart rendered successfully!');
        } catch (err) {
            console.error('❌ Chart rendering failed:', err);
        }
    };

    console.log('✅ advanced-chart.js loaded, window.renderModalChart ready');
})();
