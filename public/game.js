/**
 * Cliente del juego en Canvas HTML5 y Web Audio API
 */
class SnowImpostorsClient {
  constructor() {
    this.socket = io();
    this.codigoSala = null;
    this.token = sessionStorage.getItem('token_snow') || null;
    this.apodo = '';
    this.modo = null;
    this.esAnfitrion = false;

    this.canvas = null;
    this.ctx = null;
    this.minimapaCanvas = null;
    this.minimapaCtx = null;

    this.jugadores = {};
    this.triangulos = [];
    this.banderas = {};
    this.miX = 2000;
    this.miY = 2000;

    this.audioCtx = null;
    this.alarmaIntervalo = null;
    this.enPreguntaActual = false;
    this.pasoPreguntaActual = 0;
    this.posicionInicialSincronizada = false;

    this.initListeners();
    this.verificarUrlSala();
  }

  initListeners() {
    this.socket.on('sala-creada', ({ codigo, modo }) => {
      this.codigoSala = codigo;
      this.modo = modo;
      this.esAnfitrion = true;
      this.mostrarLobby();
    });

    this.socket.on('unido-exitoso', ({ token, modo }) => {
      this.token = token;
      sessionStorage.setItem('token_snow', token);
      this.modo = modo;
      this.mostrarLobby();
    });

    this.socket.on('error-servidor', (msg) => {
      alert(msg);
    });

    this.socket.on('actualizar-sala', ({ jugadores, anfitrion, modo }) => {
      this.esAnfitrion = (anfitrion === this.socket.id);
      this.actualizarUIListaJugadores(jugadores);
    });

    this.socket.on('cuenta-regresiva', (segundos) => {
      document.getElementById('pantalla-lobby').classList.add('oculto');
      this.posicionInicialSincronizada = false;
      this.iniciarJuegoCanvas();
    });

    this.socket.on('tick-juego', (data) => {
      this.jugadores = data.jugadores;
      this.triangulos = data.triangulos;
      this.banderas = data.banderas;

      // Sincronizar cámara con la posición de salida asignada por el servidor
      if (!this.posicionInicialSincronizada && this.jugadores[this.socket.id]) {
        this.miX = this.jugadores[this.socket.id].x;
        this.miY = this.jugadores[this.socket.id].y;
        this.posicionInicialSincronizada = true;
      }
    });

    this.socket.on('eliminado-energia', () => {
      document.getElementById('pantalla-eliminado').classList.remove('oculto');
      this.detenerAlarma();
    });

    this.socket.on('abrir-pregunta', ({ paso }) => {
      this.enPreguntaActual = true;
      this.pasoPreguntaActual = paso;
      this.detenerAlarma();
      this.mostrarCuadroPregunta(paso);
    });

    this.socket.on('mostrar-leccion', () => {
      document.getElementById('pantalla-leccion').classList.remove('oculto');
    });

    this.socket.on('partida-terminada', ({ equipoGanador, apodoHeroe }) => {
      document.getElementById('pantalla-ganador').classList.remove('oculto');
      document.getElementById('titulo-ganador').innerText = `¡GANAN LOS ${equipoGanador.toUpperCase()}!`;
      document.getElementById('subtitulo-ganador').innerText = `Héroe: ${apodoHeroe}`;
      this.detenerAlarma();
    });

    this.socket.on('regreso-lobby', () => {
      ['pantalla-leccion', 'pantalla-eliminado', 'pantalla-ganador', 'pantalla-juego'].forEach(id => {
        document.getElementById(id).classList.add('oculto');
      });
      document.getElementById('pantalla-lobby').classList.remove('oculto');
      this.detenerAlarma();
    });

    this.socket.on('salida-exitosa', () => {
      ['pantalla-leccion', 'pantalla-eliminado', 'pantalla-ganador', 'pantalla-juego', 'pantalla-lobby'].forEach(id => {
        document.getElementById(id).classList.add('oculto');
      });
      document.getElementById('pantalla-menu').classList.remove('oculto');
      this.detenerAlarma();
      this.codigoSala = null;
      sessionStorage.removeItem('token_snow');
    });

    this.socket.on('expulsado', () => {
      alert('Has sido expulsado de la sala.');
      window.location.href = '/';
    });
  }

  verificarUrlSala() {
    const params = new URLSearchParams(window.location.search);
    const salaParam = params.get('sala');
    if (salaParam) {
      document.getElementById('input-codigo').value = salaParam;
    }
  }

  crearSala(modo) {
    const apodo = document.getElementById('input-apodo').value.trim() || 'Explorador';
    this.apodo = apodo;
    this.socket.emit('crear-sala', { apodo, modo });
  }

  unirseSala() {
    const codigo = document.getElementById('input-codigo').value.trim().toUpperCase();
    const apodo = document.getElementById('input-apodo').value.trim() || 'Explorador';
    this.apodo = apodo;
    this.codigoSala = codigo;
    this.socket.emit('unirse-sala', { codigo, apodo, tokenReconexion: this.token });
  }

  mostrarLobby() {
    document.getElementById('pantalla-menu').classList.add('oculto');
    document.getElementById('pantalla-lobby').classList.remove('oculto');
    document.getElementById('lbl-codigo-sala').innerText = this.codigoSala;
    if (this.esAnfitrion) {
      document.getElementById('btn-iniciar').classList.remove('oculto');
      document.getElementById('lbl-esperando').classList.add('oculto');
    }
  }

  actualizarUIListaJugadores(jugadores) {
    const listaAzul = document.getElementById('lista-azul');
    const listaRojo = document.getElementById('lista-rojo');
    listaAzul.innerHTML = '';
    listaRojo.innerHTML = '';

    let total = 0;
    jugadores.forEach(j => {
      total++;
      const li = document.createElement('li');
      li.innerText = `${j.apodo} ${j.listo ? '✅' : ''}`;
      if (j.equipo === 'azul') listaAzul.appendChild(li);
      else listaRojo.appendChild(li);
    });

    document.getElementById('contador-jugadores').innerText = `Jugadores: ${total} / 59`;
  }

  copiarEnlace() {
    const url = `${window.location.origin}/?sala=${this.codigoSala}`;
    navigator.clipboard.writeText(url);
    alert('¡Enlace copiado al portapapeles!');
  }

  compartirRedes() {
    const url = `${window.location.origin}/?sala=${this.codigoSala}`;
    if (navigator.share) {
      navigator.share({ title: 'Snow Impostors', text: '¡Únete a mi sala de Snow Impostors!', url });
    } else {
      this.copiarEnlace();
    }
  }

  copiarCodigo() {
    navigator.clipboard.writeText(this.codigoSala);
    alert('¡Código copiado!');
  }

  iniciarPartida() {
    this.socket.emit('iniciar-partida');
  }

  volverLobby() {
    this.socket.emit('volver-lobby');
  }

  irInicio() {
    this.socket.emit('salir-sala');
  }

  iniciarJuegoCanvas() {
    document.getElementById('pantalla-juego').classList.remove('oculto');
    this.canvas = document.getElementById('canvas-juego');
    this.ctx = this.canvas.getContext('2d');
    this.minimapaCanvas = document.getElementById('canvas-minimapa');
    this.minimapaCtx = this.minimapaCanvas.getContext('2d');

    this.ajustarCanvas();
    window.addEventListener('resize', () => this.ajustarCanvas());

    this.initControles();
    this.bucleRender();
  }

  ajustarCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  initControles() {
    const keys = {};
    window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

    setInterval(() => {
      if (this.enPreguntaActual) return;
      let velocidad = 5;
      let dx = 0, dy = 0;
      if (keys['w'] || keys['arrowup']) dy -= velocidad;
      if (keys['s'] || keys['arrowdown']) dy += velocidad;
      if (keys['a'] || keys['arrowleft']) dx -= velocidad;
      if (keys['d'] || keys['arrowright']) dx += velocidad;

      if (dx !== 0 || dy !== 0) {
        this.miX += dx;
        this.miY += dy;
        this.socket.emit('mover', { x: this.miX, y: this.miY });
      }
    }, 33);
  }

  mostrarCuadroPregunta(paso) {
    const modal = document.getElementById('modal-pregunta');
    const texto = document.getElementById('pregunta-texto');
    modal.classList.remove('oculto');

    if (paso === 1) texto.innerText = '¿Cuál es tu NOMBRE COMPLETO?';
    else if (paso === 2) texto.innerText = '¿Cuál es el NOMBRE COMPLETO DE TUS PAPÁS?';
    else if (paso === 3) texto.innerText = '¿Cuál es tu EDAD?';

    this.reproducirSonidoSutil();
  }

  enviarRespuesta() {
    const val = document.getElementById('input-respuesta').value.trim();
    if (!val) return;
    document.getElementById('input-respuesta').value = '';
    document.getElementById('modal-pregunta').classList.add('oculto');

    this.socket.emit('responder-pregunta', { paso: this.pasoPreguntaActual, respuesta: val });
  }

  bucleRender() {
    const renderizar = () => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      const camX = (this.canvas.width / 2) - this.miX;
      const camY = (this.canvas.height / 2) - this.miY;

      this.ctx.save();
      this.ctx.translate(camX, camY);

      this.ctx.fillStyle = '#f1f5f9';
      this.ctx.fillRect(0, 0, 4000, 4000);

      this.triangulos.forEach(t => {
        if (t.activo) {
          this.ctx.fillStyle = '#64ffda';
          this.ctx.shadowColor = '#64ffda';
          this.ctx.shadowBlur = 15;
          this.ctx.beginPath();
          this.ctx.moveTo(t.x, t.y - 15);
          this.ctx.lineTo(t.x + 12, t.y + 10);
          this.ctx.lineTo(t.x - 12, t.y + 10);
          this.ctx.closePath();
          this.ctx.fill();
          this.ctx.shadowBlur = 0;
        }
      });

      this.dibujarBandera(this.banderas.azul, '#3b82f6', 'Base Azul');
      this.dibujarBandera(this.banderas.rojo, '#ef4444', 'Base Roja');

      for (let id in this.jugadores) {
        const j = this.jugadores[id];
        this.dibujarPersonaje(j, id === this.socket.id);
      }

      this.ctx.restore();
      this.actualizarHUD();
      requestAnimationFrame(renderizar);
    };
    requestAnimationFrame(renderizar);
  }

  dibujarPersonaje(j, esLocal) {
    if (j.eliminado) return;
    this.ctx.save();
    this.ctx.translate(j.x, j.y);

    this.ctx.fillStyle = 'rgba(0,0,0,0.2)';
    this.ctx.beginPath();
    this.ctx.arc(0, 20, 16, 0, Math.PI * 2);
    this.ctx.fill();

    const colorBase = j.equipo === 'azul' ? '#3b82f6' : '#ef4444';
    this.ctx.fillStyle = colorBase;
    this.ctx.beginPath();
    this.ctx.arc(0, -5, 18, Math.PI, 0, false);
    this.ctx.lineTo(18, 15);
    this.ctx.arc(0, 15, 18, 0, Math.PI, false);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = '#1e293b';
    this.ctx.stroke();

    this.ctx.fillStyle = '#bae6fd';
    this.ctx.beginPath();
    this.ctx.ellipse(6, -2, 8, 5, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();

    if (j.equipo === 'azul') {
      this.ctx.fillStyle = colorBase;
      this.ctx.beginPath();
      this.ctx.ellipse(-6, -28, 4, 12, -0.2, 0, Math.PI * 2);
      this.ctx.ellipse(6, -28, 4, 12, 0.2, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
    } else {
      this.ctx.strokeStyle = '#78350f';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.moveTo(-4, -22);
      this.ctx.lineTo(-12, -34);
      this.ctx.moveTo(-8, -28);
      this.ctx.lineTo(-2, -30);
      this.ctx.moveTo(4, -22);
      this.ctx.lineTo(12, -34);
      this.ctx.moveTo(8, -28);
      this.ctx.lineTo(2, -30);
      this.ctx.stroke();
    }

    if (esLocal) {
      this.ctx.strokeStyle = '#64ffda';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, 26, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    this.ctx.fillStyle = '#fff';
    this.ctx.font = 'bold 12px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(esLocal ? `${j.apodo} (TÚ)` : j.apodo, 0, -38);

    this.ctx.restore();
  }

  dibujarBandera(bandera, color, label) {
    if (!bandera) return;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(bandera.x - 4, bandera.y - 40, 8, 50);
    this.ctx.beginPath();
    this.ctx.moveTo(bandera.x + 4, bandera.y - 40);
    this.ctx.lineTo(bandera.x + 30, bandera.y - 25);
    this.ctx.lineTo(bandera.x + 4, bandera.y - 10);
    this.ctx.fill();
  }

  actualizarHUD() {
    const miJugador = this.jugadores[this.socket.id];
    if (miJugador) {
      const porcentaje = Math.max(0, miJugador.energia);
      document.getElementById('barra-nivel').style.width = `${porcentaje}%`;
      document.getElementById('txt-energia').innerText = `${Math.round(porcentaje)}%`;

      const alarma = document.getElementById('aviso-alarma');
      if (porcentaje <= 10 && porcentaje > 0) {
        alarma.classList.remove('oculto');
        this.iniciarAlarmaSonido();
      } else {
        alarma.classList.add('oculto');
        this.detenerAlarma();
      }
    }
  }

  iniciarAlarmaSonido() {
    if (this.alarmaIntervalo || this.enPreguntaActual) return;
    this.alarmaIntervalo = setInterval(() => {
      this.reproducirBeep(440, 0.1);
    }, 800);
  }

  detenerAlarma() {
    if (this.alarmaIntervalo) {
      clearInterval(this.alarmaIntervalo);
      this.alarmaIntervalo = null;
    }
  }

  reproducirBeep(frecuencia, duracion) {
    try {
      if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.frequency.value = frecuencia;
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
      osc.stop(this.audioCtx.currentTime + duracion);
    } catch (e) {}
  }

  reproducirSonidoSutil() {
    this.reproducirBeep(587.33, 0.15);
  }
}

const app = new SnowImpostorsClient();
