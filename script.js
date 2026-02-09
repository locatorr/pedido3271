document.addEventListener('DOMContentLoaded', () => {

    // ================= CONFIG =================
    const TEMPO_VIAGEM_RESTANTE_HORAS = 30;

    // Salinas - MG (PRF)
    const CHECKPOINT_SALINAS = [-16.1596, -42.2998]; // [lat, lng]

    const CHAVE_INICIO_RESTANTE = 'inicio_viagem_restante';

    // ================= ROTAS =================
    const ROTAS = {
    "01000": {
        destinoNome: "Fortaleza - CE",
        destinoDesc: "CEP: 60165-121 (Meireles)",
        start: [-38.5267, -3.7319], // São Paulo - SP
        end:   [-46.6333, -23.5505]   // Fortaleza - CE
    }
};


    // ================= VARIÁVEIS =================
    let map, polyline, carMarker;
    let fullRoute = [];
    let rotaAtual = null;
    let loopInterval = null;
    let indexInicio = 0;

    // ================= INIT =================
    document.getElementById('btn-login')?.addEventListener('click', verificarCodigo);
    verificarSessaoSalva();

    // ================= FUNÇÕES =================

    function verificarCodigo() {
        const code = document.getElementById('access-code').value.trim();
        if (!ROTAS[code]) return;

        localStorage.setItem('codigoAtivo', code);
        carregarInterface(code);
    }

    function verificarSessaoSalva() {
        const codigo = localStorage.getItem('codigoAtivo');
        if (codigo && ROTAS[codigo]) {
            document.getElementById('access-code').value = codigo;
        }
    }

    function carregarInterface(codigo) {
        rotaAtual = ROTAS[codigo];

        buscarRotaReal(rotaAtual.start, rotaAtual.end).then(() => {
            document.getElementById('login-overlay').style.display = 'none';
            document.getElementById('info-card').style.display = 'flex';
            iniciarMapa();
        });
    }

    async function buscarRotaReal(start, end) {
        const url = `https://router.project-osrm.org/route/v1/driving/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson`;
        const data = await fetch(url).then(r => r.json());
        fullRoute = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
    }

    function iniciarMapa() {

        // 🔍 encontra o ponto da rota mais próximo de Salinas
        let menorDist = Infinity;
        fullRoute.forEach((p, i) => {
            const d = Math.hypot(
                p[0] - CHECKPOINT_SALINAS[0],
                p[1] - CHECKPOINT_SALINAS[1]
            );
            if (d < menorDist) {
                menorDist = d;
                indexInicio = i;
            }
        });

        map = L.map('map', { zoomControl: false })
            .setView(CHECKPOINT_SALINAS, 6);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png')
            .addTo(map);

        // rota COMPLETA (Montes Claros → João Pessoa)
        L.polyline(fullRoute, {
            color: '#94a3b8',
            weight: 4,
            opacity: 0.5
        }).addTo(map);

        // rota RESTANTE (Salinas → João Pessoa)
        polyline = L.polyline(fullRoute.slice(indexInicio), {
            color: '#2563eb',
            weight: 5,
            dashArray: '10,10'
        }).addTo(map);

        // Ícone do Caminhão
        const truckIcon = L.divIcon({
            className: 'custom-marker',
            html: '<div class="car-icon">🚛</div>',
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });
         carMarker = L.marker(fullRoute[0], { icon: truckIcon, zIndexOffset: 1000 }).addTo(map)

        if (!localStorage.getItem(CHAVE_INICIO_RESTANTE)) {
            localStorage.setItem(CHAVE_INICIO_RESTANTE, Date.now());
        }

        loopInterval = setInterval(atualizarPosicao, 1000);
        atualizarPosicao();
    }

    function atualizarPosicao() {
        const inicio = parseInt(localStorage.getItem(CHAVE_INICIO_RESTANTE));
        const agora = Date.now();

        let progresso = (agora - inicio) /
            (TEMPO_VIAGEM_RESTANTE_HORAS * 3600000);

        progresso = Math.min(Math.max(progresso, 0), 1);

        const rotaRestante = fullRoute.slice(indexInicio);
        const idx = Math.floor(progresso * (rotaRestante.length - 1));
        const pos = rotaRestante[idx];

        carMarker.setLatLng(pos);
        desenharLinhaRestante(pos, rotaRestante, idx);

        const badge = document.getElementById('time-badge');
        if (badge) {
            if (progresso >= 1) {
                badge.innerText = "ENTREGUE";
            } else {
                const h = ((1 - progresso) * TEMPO_VIAGEM_RESTANTE_HORAS).toFixed(1);
                badge.innerText = `EM TRÂNSITO • FALTA ${h}h`;
            }
        }
    }

    function desenharLinhaRestante(pos, rota, idx) {
        map.removeLayer(polyline);
        polyline = L.polyline(
            [pos, ...rota.slice(idx + 1)],
            { dashArray: '10,10', color: '#2563eb', weight: 5 }
        ).addTo(map);
    }
});
