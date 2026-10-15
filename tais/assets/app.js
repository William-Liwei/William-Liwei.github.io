(function () {
'use strict';
const previewCanvas = document.getElementById('tais-preview-chart');
        const previewContext = previewCanvas.getContext('2d');
        const previewValues = Array.from({ length: 56 }, (_, index) =>
            0.49 + 0.14 * Math.sin(index * 0.2) + 0.055 * Math.sin(index * 0.67) + (index > 42 ? (index - 42) * 0.004 : 0)
        );
        const previewModes = {
            forecast: {
                prompt: 'Forecast the next 24 periods and show the expected range.',
                chart: 'Observed + forecast',
                label: 'Model view',
                title: 'Stable upward trend',
                copy: 'The illustrative forecast follows the recent level while showing a plausible range for future values.',
                foot: 'Forecast horizon<br>Next 24 periods',
                legend: '<span><i class="legend-dot"></i>Observed</span><span><i class="legend-dot forecast"></i>Forecast range</span>'
            },
            anomaly: {
                prompt: 'Find unusual changes and show where they occur.',
                chart: 'Observed + flagged points',
                label: 'Diagnostic view',
                title: 'Three unusual points',
                copy: 'A sample diagnostic highlights abrupt deviations for closer review by an analyst.',
                foot: 'Review queue<br>Illustrative flags',
                legend: '<span><i class="legend-dot"></i>Observed</span><span><i class="legend-dot anomaly"></i>Flagged point</span>'
            },
            report: {
                prompt: 'Summarize the series behavior for a weekly report.',
                chart: 'Observed + trend',
                label: 'Report view',
                title: 'Demand is gradually rising',
                copy: 'A concise narrative pairs the overall trend with notable changes and context for the reporting period.',
                foot: 'Output<br>Analyst-ready summary',
                legend: '<span><i class="legend-dot"></i>Observed</span><span><i class="legend-dot forecast"></i>Trend line</span>'
            }
        };

        function drawPreview(mode) {
            const bounds = previewCanvas.getBoundingClientRect();
            if (!bounds.width || !bounds.height || !previewContext) return;
            const ratio = Math.min(window.devicePixelRatio || 1, 2);
            previewCanvas.width = Math.round(bounds.width * ratio);
            previewCanvas.height = Math.round(bounds.height * ratio);
            const ctx = previewContext;
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            const width = bounds.width;
            const height = bounds.height;
            const plot = { left: 31, right: width - 12, top: 14, bottom: height - 22 };
            const x = index => plot.left + (index / (previewValues.length - 1)) * (plot.right - plot.left);
            const y = value => plot.bottom - value * (plot.bottom - plot.top);

            ctx.clearRect(0, 0, width, height);
            ctx.font = '9px ui-monospace, monospace';
            ctx.textBaseline = 'middle';
            for (let row = 0; row < 4; row += 1) {
                const gy = plot.top + row * (plot.bottom - plot.top) / 3;
                ctx.strokeStyle = '#e9efed';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(plot.left, gy);
                ctx.lineTo(plot.right, gy);
                ctx.stroke();
                ctx.fillStyle = '#8a9999';
                ctx.fillText(`${90 - row * 20}`, 3, gy);
            }

            if (mode === 'forecast') {
                const start = 40;
                ctx.beginPath();
                ctx.moveTo(x(start), y(previewValues[start] + 0.09));
                for (let index = start + 1; index < previewValues.length; index += 1) ctx.lineTo(x(index), y(previewValues[index] + 0.09));
                for (let index = previewValues.length - 1; index >= start; index -= 1) ctx.lineTo(x(index), y(previewValues[index] - 0.09));
                ctx.closePath();
                ctx.fillStyle = 'rgba(223, 173, 57, .16)';
                ctx.fill();
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = '#d5a42e';
                ctx.lineWidth = 2;
                ctx.beginPath();
                for (let index = start; index < previewValues.length; index += 1) {
                    if (index === start) ctx.moveTo(x(index), y(previewValues[index]));
                    else ctx.lineTo(x(index), y(previewValues[index]));
                }
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.strokeStyle = '#c7d3d0';
                ctx.beginPath();
                ctx.moveTo(x(start), plot.top);
                ctx.lineTo(x(start), plot.bottom);
                ctx.stroke();
            }

            ctx.strokeStyle = '#118184';
            ctx.lineWidth = 2.2;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.beginPath();
            previewValues.forEach((value, index) => {
                if (mode === 'forecast' && index > 40) return;
                if (index === 0) ctx.moveTo(x(index), y(value));
                else ctx.lineTo(x(index), y(value));
            });
            ctx.stroke();

            if (mode === 'anomaly') {
                [15, 32, 45].forEach((index, point) => {
                    const anomalyY = y(previewValues[index] + (point === 1 ? 0.2 : -0.17));
                    ctx.fillStyle = '#d96c55';
                    ctx.beginPath();
                    ctx.arc(x(index), anomalyY, 4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                });
            } else if (mode === 'report') {
                ctx.setLineDash([3, 4]);
                ctx.strokeStyle = '#d5a42e';
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                previewValues.forEach((_, index) => {
                    const from = Math.max(0, index - 3);
                    const segment = previewValues.slice(from, index + 1);
                    const average = segment.reduce((sum, value) => sum + value, 0) / segment.length;
                    if (index === 0) ctx.moveTo(x(index), y(average));
                    else ctx.lineTo(x(index), y(average));
                });
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        function selectPreviewMode(mode) {
            const content = previewModes[mode];
            if (!content) return;
            document.querySelectorAll('[data-preview-mode]').forEach(button => {
                button.setAttribute('aria-pressed', String(button.dataset.previewMode === mode));
            });
            document.getElementById('preview-prompt-text').textContent = content.prompt;
            document.getElementById('preview-chart-title').textContent = content.chart;
            document.getElementById('preview-insight-label').textContent = content.label;
            document.getElementById('preview-insight-title').textContent = content.title;
            document.getElementById('preview-insight-copy').textContent = content.copy;
            document.getElementById('preview-insight-foot').innerHTML = content.foot;
            document.getElementById('preview-legend').innerHTML = content.legend;
            drawPreview(mode);
        }

        document.querySelectorAll('[data-preview-mode]').forEach(button => {
            button.addEventListener('click', () => selectPreviewMode(button.dataset.previewMode));
        });
        window.addEventListener('resize', () => {
            const selected = document.querySelector('[data-preview-mode][aria-pressed="true"]');
            drawPreview(selected ? selected.dataset.previewMode : 'forecast');
        });
        selectPreviewMode('forecast');

        const links = Array.from(document.querySelectorAll('nav a[href^="#"]'));
        let frame = 0;
        function updateNavigation() {
            frame = 0;
            const offset = document.querySelector('.site-header').getBoundingClientRect().height + 48;
            let current = '';
            let closest = -Infinity;
            links.forEach(link => {
                const section = document.getElementById(link.hash.slice(1));
                if (!section) return;
                const top = section.getBoundingClientRect().top;
                if (top <= offset && top > closest) { current = link.hash; closest = top; }
            });
            links.forEach(link => current === link.hash ? link.setAttribute('aria-current', 'location') : link.removeAttribute('aria-current'));
        }
        window.addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(updateNavigation); }, { passive: true });
        window.addEventListener('resize', updateNavigation);
        updateNavigation();

        // Animate only elements that enter the viewport. Content is visible by
        // default, including when JavaScript or this optional enhancement fails.
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
        if ('IntersectionObserver' in window && !reduce.matches) {
            const reveal = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    reveal.unobserve(entry.target);
                    if (reduce.matches || !entry.target.animate) return;
                    entry.target.animate([{ opacity: .35, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 440, easing: 'cubic-bezier(.2,.7,.3,1)' });
                });
            }, { threshold: .12 });
            document.querySelectorAll('.section-heading, .research-item, .program, .member, .roadmap-item').forEach(element => reveal.observe(element));
        }
    
})();
