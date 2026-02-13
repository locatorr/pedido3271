document.addEventListener('DOMContentLoaded', () => {
    
    // --- CONFIGURAÇÃO GLOBAL ---
    // Viagem Montes Claros -> Juiz de Fora (Aprox. 600km)
    const TEMPO_TOTAL_VIAGEM_HORAS = 12; 

    // --- BANCO DE DADOS DE ROTAS ---
    const ROTAS = {
        "36070150": {  // <--- SENHA (O PRÓPRIO CEP)
            id: "rota_jf_mg",
            
            // VISUAL
            destinoNome: "Juiz de Fora - MG", 
            destinoDesc: "CEP: 36070-150 (B. Industrial)",
            
            // COORDENADAS [Longitude, Latitude]
            
            // Origem: Montes Claros - MG
            start: [-43.8750, -16.7350], 
            
            // Destino: Juiz de Fora - MG (CEP 36070-150)
            end:   [-43.3765, -21.7290], 
            
            // Offset 0 = Começa a viagem do início (Saindo de Montes Claros)
            offsetHoras: 0 
        }
    };

    // --- VARIÁVEIS DE CONTROLE ---
    let map, polyline, carMarker;
    let fullRoute = []; 
    let rotaAtual = null;
    let loopInterval = null;

    // --- INICIALIZAÇÃO ---
    const btnLogin = document.getElementById('btn-login');
    if (btnLogin) {
        btnLogin.addEventListener('click', verificarCodigo);
    }

    verificarSessaoSalva();

    // --- FUNÇÕES ---

    function verificarCodigo() {
        const input = document.getElementById('access-code');
        // Remove traços e espaços caso o usuário digite
        const codigoDigitado = input.value.replace(/[^0-9]/g, ''); 
        const errorMsg = document.getElementById('error-msg');

        if (ROTAS[codigoDigitado]) {
            localStorage.setItem('codigoAtivo', codigoDigitado);
            
            const keyStorage = 'inicioViagem_' + codigoDigitado;
            if (!localStorage.getItem(keyStorage)) {
                localStorage.setItem(keyStorage, Date.now());
            }

            carregarInterface(codigoDigitado);
        } else {
            if(errorMsg) errorMsg.style.display = 'block';
            input.style.borderColor = 'red';
        }
    }

    function verificarSessaoSalva() {
        const codigoSalvo = localStorage.getItem('codigoAtivo');
        const overlay = document.getElementById('login-overlay');
        
        if (codigoSalvo && ROTAS[codigoSalvo] && overlay && overlay.style.display !== 'none') {
            document.getElementById('access-code').value = codigoSalvo;
        }
    }

    function carregarInterface(codigo) {
        rotaAtual = ROTAS[codigo];
        const overlay = document.getElementById('login-overlay');
        const infoCard = document.getElementById('info-card');
        const btn = document.getElementById('btn-login');

        // Tenta atualizar o texto do CEP no card se existir o elemento
        const descElement = document.getElementById('destino-desc');
        if(descElement) descElement.innerText = rotaAtual.destinoDesc;

        if(btn) {
            btn.innerText = "Localizando veículo...";
            btn.disabled = true;
        }

        buscarRotaReal(rotaAtual.start, rotaAtual.end).then(() => {
            if(overlay) overlay.style.display = 'none';
            if(infoCard) infoCard.style.display = 'flex';
            atualizarTextoInfo();
            iniciarMapa();
        }).catch(err => {
            console.error(err);
            alert("Erro ao traçar rota. Verifique a conexão.");
            if(btn) {
                btn.innerText = "Tentar Novamente";
                btn.disabled = false;
            }
        });
    }

    function atualizarTextoInfo() {
        const infoTextDiv = document.querySelector('.info-text');
        if(infoTextDiv && rotaAtual) {
            infoTextDiv.innerHTML = `
                <h3>Rastreamento Rodoviário</h3>
                <span id="time-badge" class="status-badge">CONECTANDO...</span>
                <p><strong>Origem:</strong> Montes Claros - MG</p>
                <p><strong>Destino:</strong> ${rotaAtual.destinoNome}</p>
                <p style="font-size: 11px; color: #666;">${rotaAtual.destinoDesc}</p>
            `;
        }
    }

    async function buscarRotaReal(start, end) {
        const coordsUrl = `${start[0]},${start[1]};${end[0]},${end[1]}`;
        const url = `https://router.project-osrm.org/route/v1/driving/${coordsUrl}?overview=full&geometries=geojson`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
            fullRoute = data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
        } else {
            throw new Error("Rota não encontrada");
        }
    }

    function iniciarMapa() {
        if (map) return; 

        map = L.map('map', { zoomControl: false }).setView(fullRoute[0], 6);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; CartoDB', maxZoom: 18
        }).addTo(map);

        polyline = L.polyline(fullRoute, {
            color: '#2563eb', weight: 5, opacity: 0.7, dashArray: '10, 10', lineJoin: 'round'
        }).addTo(map);

        const truckIcon = L.divIcon({
            className: 'car-marker',
            html: '<div class="car-icon" style="font-size:35px;">🚛</div>',
            iconSize: [40, 40], iconAnchor: [20, 20]
        });

        carMarker = L.marker(fullRoute[0], { icon: truckIcon }).addTo(map);
        L.marker(fullRoute[fullRoute.length - 1]).addTo(map).bindPopup(`<b>Destino:</b> ${rotaAtual.destinoNome}`);

        if (loopInterval) clearInterval(loopInterval);
        loopInterval = setInterval(atualizarPosicaoTempoReal, 1000);
        
        atualizarPosicaoTempoReal(); 
    }

    function atualizarPosicaoTempoReal() {
        if (fullRoute.length === 0 || !rotaAtual) return;

        const codigoAtivo = localStorage.getItem('codigoAtivo');
        const keyStorage = 'inicioViagem_' + codigoAtivo;
        
        let inicio = parseInt(localStorage.getItem(keyStorage));
        if (!inicio) {
            inicio = Date.now();
            localStorage.setItem(keyStorage, inicio);
        }

        const agora = Date.now();
        const tempoDecorridoMs = agora - inicio;
        const tempoComOffset = tempoDecorridoMs + (rotaAtual.offsetHoras || 0) * 3600000;
        const tempoTotalMs = TEMPO_TOTAL_VIAGEM_HORAS * 60 * 60 * 1000;
        
        let progresso = tempoComOffset / tempoTotalMs;

        if (progresso < 0) progresso = 0;
        if (progresso > 1) progresso = 1;

        const posicaoAtual = getCoordenadaPorProgresso(progresso);
        if(carMarker) carMarker.setLatLng(posicaoAtual);
        
        desenharLinhaRestante(posicaoAtual, progresso);

        const timeBadge = document.getElementById('time-badge');
        if (progresso >= 1) {
            if(timeBadge) {
                timeBadge.innerText = "ENTREGUE";
                timeBadge.style.background = "#d1fae5";
                timeBadge.style.color = "#065f46";
            }
        } else {
            const msRestantes = tempoTotalMs - tempoComOffset;
            const horasRestantes = (msRestantes / (1000 * 60 * 60)).toFixed(1);
            
            if(timeBadge) {
                timeBadge.innerText = `EM TRÂNSITO: FALTA ${horasRestantes}h`;
                timeBadge.style.background = "#e3f2fd";
                timeBadge.style.color = "#1976d2";
                timeBadge.style.border = "none";
                timeBadge.style.animation = "none";
            }
            carMarker.unbindTooltip(); 
        }
    }

    function getCoordenadaPorProgresso(pct) {
        const totalPontos = fullRoute.length - 1;
        const pontoVirtual = pct * totalPontos;
        
        const indexAnterior = Math.floor(pontoVirtual);
        const indexProximo = Math.ceil(pontoVirtual);
        
        if (indexAnterior >= totalPontos) return fullRoute[totalPontos];

        const p1 = fullRoute[indexAnterior];
        const p2 = fullRoute[indexProximo];
        
        const resto = pontoVirtual - indexAnterior;
        
        const lat = p1[0] + (p2[0] - p1[0]) * resto;
        const lng = p1[1] + (p2[1] - p1[1]) * resto;
        
        return [lat, lng];
    }

    function desenharLinhaRestante(posicaoAtual, pct) {
        if (polyline) map.removeLayer(polyline);

        const indexAtual = Math.floor(pct * (fullRoute.length - 1));
        const rotaRestante = [posicaoAtual, ...fullRoute.slice(indexAtual + 1)];

        polyline = L.polyline(rotaRestante, {
            color: '#2563eb', weight: 5, opacity: 0.7, dashArray: '10, 10', lineJoin: 'round'
        }).addTo(map);
    }
});
