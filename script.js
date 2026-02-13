document.addEventListener('DOMContentLoaded', () => {
    
    // --- CONFIGURAÇÃO GLOBAL ---
    // Montes Claros -> Juiz de Fora
    const TEMPO_TOTAL_VIAGEM_HORAS = 12; 

    // --- BANCO DE DADOS DE ROTAS ---
    const ROTAS = {
        "45861": {  // <--- SENHA (CEP)
            id: "rota_jf_mg",
            
            // VISUAL
            destinoNome: "Juiz de Fora - MG", 
            destinoDesc: "CEP: 36070-150 (B. Industrial)",
            
            // COORDENADAS [Longitude, Latitude]
            start: [-43.8750, -16.7350], // Montes Claros
            end:   [-43.3765, -21.7290], // Juiz de Fora
            
            // Offset: 1 hora (Apenas o tempo de chegar em Bocaiúva)
            offsetHoras: 1,

            // --- REGRA DE PARADA: BOCAIÚVA (BR-135) ---
            verificarRegras: function(posicaoAtual, map, loopInterval, timeBadge, carMarker) {
                
                // Coordenada na BR-135 em Bocaiúva
                const CHECKPOINT_BOCAIUVA = [-17.1120, -43.8150]; 
                
                // 1. PÁRA TUDO
                clearInterval(loopInterval); 
                
                // 2. POSICIONA O CAMINHÃO
                if(carMarker) carMarker.setLatLng(CHECKPOINT_BOCAIUVA);
                
                // 3. ZOOM NO LOCAL
                if(map) map.setView(CHECKPOINT_BOCAIUVA, 16);

                // 4. ALERTA VERMELHO
                if(timeBadge) {
                    timeBadge.innerText = "RETIDO: DOCUMENTAÇÃO";
                    timeBadge.style.backgroundColor = "#b71c1c"; 
                    timeBadge.style.color = "white";
                    timeBadge.style.border = "2px solid #ff5252";
                    timeBadge.style.animation = "blink 1.5s infinite";
                }

                // 5. PLAQUINHA DETALHADA
                const htmlPlaquinha = `
                    <div style="display: flex; align-items: center; gap: 10px; font-family: sans-serif; min-width: 220px;">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Pol%C3%ADcia_Rodovi%C3%A1ria_Federal_logo.svg/1024px-Pol%C3%ADcia_Rodovi%C3%A1ria_Federal_logo.svg.png" style="width: 45px; height: auto;">
                        <div style="text-align: left; line-height: 1.2;">
                            <strong style="font-size: 14px; color: #b71c1c; display: block;">PRF - BOCAIÚVA</strong>
                            <span style="font-size: 11px; color: #333; font-weight: bold;">FALTA DE NOTA FISCAL</span><br>
                            <span style="font-size: 11px; color: #666;">Veículo Retido no Posto</span>
                        </div>
                    </div>`;

                if(carMarker) {
                    carMarker.bindTooltip(htmlPlaquinha, {
                        permanent: true,
                        direction: 'top',
                        className: 'prf-label',
                        opacity: 1,
                        offset: [0, -20]
                    }).openTooltip();
                }

                return true;
            }
        }
    };

    // --- ESTILO PISCA-PISCA ---
    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.7; } 100% { opacity: 1; } }
        .prf-label { background: white; border: 2px solid #b71c1c; border-radius: 8px; padding: 6px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); }
    `;
    document.head.appendChild(style);

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
        const codigoDigitado = input.value.replace(/[^0-9]/g, ''); 
        const errorMsg = document.getElementById('error-msg');

        if (ROTAS[codigoDigitado]) {
            localStorage.setItem('codigoAtivo', codigoDigitado);
            
            // Reinicia o timer para forçar a parada em Bocaiúva
            const keyStorage = 'inicioViagem_Bocaiuva_' + codigoDigitado;
            localStorage.setItem(keyStorage, Date.now());

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
            alert("Erro ao traçar rota.");
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

        // --- VERIFICAÇÃO DE PARADA (BOCAIÚVA) ---
        const timeBadge = document.getElementById('time-badge');
        if (rotaAtual.verificarRegras) {
            const parou = rotaAtual.verificarRegras([0,0], map, loopInterval, timeBadge, carMarker);
            if (parou) return; 
        }

        const codigoAtivo = localStorage.getItem('codigoAtivo');
        const keyStorage = 'inicioViagem_Bocaiuva_' + codigoAtivo;
        
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
        
        if (timeBadge) {
             timeBadge.innerText = "EM TRÂNSITO";
             timeBadge.style.background = "#e3f2fd";
             timeBadge.style.color = "#1976d2";
             timeBadge.style.border = "none";
             timeBadge.style.animation = "none";
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

