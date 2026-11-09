/**
 * Gestor de Salas y Lógica de Servidor Autoritaria
 * Constantes principales, manejo de estados, física de juego y validaciones estrictas.
 */
const BotManager = require('./bot');

const ENERGIA_INICIAL = 100;
const GASTO_ENERGIA_POR_SEGUNDO = 4.76; 
const ENERGIA_POR_TRIANGULO = 21;
const MAX_JUGADORES = 59;
const MIN_JUGADORES_GRUPO = 2;
const TIEMPO_RECONEXION = 60;
const MAP_WIDTH = 4000;
const MAP_HEIGHT = 4000;

class RoomManager {
  constructor(io) {
    this.io = io;
    this.salas = new Map();
    this.conexionesJugadores = new Map(); 
  }

  generarCodigo() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; 
    let codigo = '';
    for (let i = 0; i < 6; i++) {
      codigo += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return this.salas.has(codigo) ? this.generarCodigo() : codigo;
  }

  crearSala(socket, apodo, modo) {
    if (this.conexionesJugadores.has(socket.id)) {
      throw new Error('Ya estás en una sala.');
    }
    const codigo = this.generarCodigo();
    const sala = {
      codigo,
      modo, 
      estado: 'LOBBY', 
      anfitrion: socket.id,
      jugadores: new Map(),
      reconectando: new Map(), 
      triangulos: this.generarTriangulosIniciales(),
      banderas: {
        azul: { x: 400, y: 2000, portador: null, enSuelo: false },
        rojo: { x: 3600, y: 2000, portador: null, enSuelo: false }
      },
      permitirEntradaEnCurso: false,
      bots: modo === 'bot' ? new BotManager(this, codigo) : null
    };

    this.salas.set(codigo, sala);
    this.agregarJugadorASala(socket, sala, apodo, true);
    return sala;
  }

  unirseSala(socket, codigo, apodo, tokenReconexion) {
    const sala = this.salas.get(codigo);
    if (!sala) return { error: 'Sala no encontrada.' };

    for (let [id, j] of sala.jugadores) {
      if (id === socket.id) return { error: 'Ya estás en esta sala.' };
    }

    if (tokenReconexion && sala.reconectando.has(tokenReconexion)) {
      const datos = sala.reconectando.get(tokenReconexion);
      clearTimeout(datos.timeout);
      sala.reconectando.delete(tokenReconexion);
      sala.jugadores.set(socket.id, datos.jugador);
      datos.jugador.socketId = socket.id;
      datos.jugador.desconectado = false;
      this.conexionesJugadores.set(socket.id, { codigoSala: codigo, token: tokenReconexion });
      socket.join(codigo);
      this.sincronizarSala(codigo);
      return { token: tokenReconexion, equipo: datos.jugador.equipo, modo: sala.modo };
    }

    if (sala.estado !== 'LOBBY' && !sala.permitirEntradaEnCurso) {
      return { error: 'La partida ya empezó.' };
    }

    if (sala.jugadores.size >= MAX_JUGADORES) {
      return { error: 'Sala llena (máximo 59 jugadores).' };
    }

    if (sala.modo === 'pareja' && sala.jugadores.size >= 2) {
      return { error: 'Sala llena (pareja completa).' };
    }

    const token = Math.random().toString(36).substring(2);
    this.agregarJugadorASala(socket, sala, apodo, false, token);
    return { token, equipo: sala.jugadores.get(socket.id).equipo, modo: sala.modo };
  }

  agregarJugadorASala(socket, sala, apodo, esAnfitrion, token = Math.random().toString(36)) {
    let azules = 0, rojos = 0;
    for (let j of sala.jugadores.values()) {
      if (j.equipo === 'azul') azules++;
      else rojos++;
    }

    let equipo = 'azul';
    if (sala.modo === 'pareja') {
      equipo = azules === 0 ? 'azul' : 'rojo';
    } else {
      if (azules < rojos) equipo = 'azul';
      else if (rojos < azules) equipo = 'rojo';
      else equipo = Math.random() < 0.5 ? 'azul' : 'rojo';
    }

    const jugador = {
      socketId: socket.id,
      token,
      apodo: apodo || 'Explorador',
      equipo,
      x: equipo === 'azul' ? 500 : 3500,
      y: 2000,
      energia: ENERGIA_INICIAL,
      eliminado: false,
      listo: false,
      pasoPregunta: 0,
      enPregunta: false,
      tieneBandera: false,
      desconectado: false
    };

    sala.jugadores.set(socket.id, jugador);
    this.conexionesJugadores.set(socket.id, { codigoSala: sala.codigo, token });
    socket.join(sala.codigo);
    this.sincronizarSala(sala.codigo);
  }

  cambiarEquipo(socket, equipoDeseado) {
    const info = this.conexionesJugadores.get(socket.id);
    if (!info) return;
    const sala = this.salas.get(info.codigoSala);
    if (!sala || sala.estado !== 'LOBBY' || sala.modo === 'pareja') return;

    let azules = 0, rojos = 0;
    for (let j of sala.jugadores.values()) {
      if (j.equipo === 'azul') azules++;
      else rojos++;
    }

    const jugador = sala.jugadores.get(socket.id);
    if (equipoDeseado === 'azul' && azules - rojos >= 1) return;
    if (equipoDeseado === 'rojo' && rojos - azules >= 1) return;

    jugador.equipo = equipoDeseado;
    this.sincronizarSala(sala.codigo);
  }

  toggleListo(socket) {
    const info = this.conexionesJugadores.get(socket.id);
    if (!info) return;
    const sala = this.salas.get(info.codigoSala);
    if (!sala || sala.estado !== 'LOBBY') return;

    const j = sala.jugadores.get(socket.id);
    if (j) {
      j.listo = !j.listo;
      this.sincronizarSala(sala.codigo);
    }
  }

  iniciarPartida(socket) {
    const info = this.conexionesJugadores.get(socket.id);
    if (!info) return;
    const sala = this.salas.get(info.codigoSala);
    if (!sala || sala.anfitrion !== socket.id || sala.estado !== 'LOBBY') return;

    let azules = 0, rojos = 0;
    for (let j of sala.jugadores.values()) {
      if (j.equipo === 'azul') azules++;
      else rojos++;
    }

    if (sala.modo === 'pareja' && sala.jugadores.size < 2) return;
    if (sala.modo === 'grupo' && (sala.jugadores.size < MIN_JUGADORES_GRUPO || azules === 0 || rojos === 0)) return;
    if (sala.modo === 'bot' && sala.jugadores.size < 1) return;

    sala.estado = 'CUENTA_REGRESIVA';
    this.io.to(sala.codigo).emit('cuenta-regresiva', 3);

    setTimeout(() => {
      if (sala.estado === 'CUENTA_REGRESIVA') {
        sala.estado = 'JUGANDO';
        this.iniciarBucleJuego(sala);
      }
    }, 3000);
  }

  iniciarBucleJuego(sala) {
    sala.intervaloJuego = setInterval(() => {
      if (sala.estado !== 'JUGANDO') {
        clearInterval(sala.intervaloJuego);
        return;
      }

      for (let j of sala.jugadores.values()) {
        if (!j.eliminado && !j.enPregunta && !j.desconectado) {
          j.energia -= GASTO_ENERGIA_POR_SEGUNDO * 0.033;
          if (j.energia <= 0) {
            j.energia = 0;
            j.eliminado = true;
            if (j.tieneBandera) {
              j.tieneBandera = false;
              this.soltarBandera(sala, j);
            }
            this.io.to(j.socketId).emit('eliminado-energia');
          }
        }
      }

      if (sala.bots) sala.bots.actualizar(0.033);

      this.verificarCondicionesVictoria(sala);
      this.sincronizarJuego(sala);
    }, 33);
  }

  actualizarMovimiento(socket, { x, y }) {
    const info = this.conexionesJugadores.get(socket.id);
    if (!info) return;
    const sala = this.salas.get(info.codigoSala);
    if (!sala || sala.estado !== 'JUGANDO') return;

    const j = sala.jugadores.get(socket.id);
    if (j && !j.eliminado && !j.enPregunta) {
      const dx = x - j.x;
      const dy = y - j.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 50) {
        j.x = Math.max(0, Math.min(MAP_WIDTH, x));
        j.y = Math.max(0, Math.min(MAP_HEIGHT, y));

        this.verificarTriangulos(sala, j);
        this.verificarBanderas(sala, j);
      }
    }
  }

  generarTriangulosIniciales() {
    const triangulos = [];
    for (let i = 0; i < 40; i++) {
      triangulos.push({
        id: i,
        x: Math.random() * (MAP_WIDTH - 200) + 100,
        y: Math.random() * (MAP_HEIGHT - 200) + 100,
        activo: true
      });
    }
    return triangulos;
  }

  verificarTriangulos(sala, jugador) {
    sala.triangulos.forEach(t => {
      if (t.activo && Math.hypot(t.x - jugador.x, t.y - jugador.y) < 40) {
        t.activo = false;
        jugador.energia = Math.min(100, jugador.energia + ENERGIA_POR_TRIANGULO);
        
        jugador.enPregunta = true;
        jugador.pasoPregunta++;
        this.io.to(jugador.socketId).emit('abrir-pregunta', { paso: jugador.pasoPregunta });

        setTimeout(() => { t.activo = true; }, 15000);
      }
    });
  }

  procesarRespuestaPregunta(socket, paso, respuesta) {
    const info = this.conexionesJugadores.get(socket.id);
    if (!info) return;
    const sala = this.salas.get(info.codigoSala);
    if (!sala) return;

    const j = sala.jugadores.get(socket.id);
    if (!j) return;

    j.enPregunta = false;

    if (paso >= 3) {
      j.eliminado = true;
      if (j.tieneBandera) {
        j.tieneBandera = false;
        this.soltarBandera(sala, j);
      }
      this.io.to(socket.id).emit('mostrar-leccion');
    }
  }

  verificarBanderas(sala, jugador) {
    const bAzul = sala.banderas.azul;
    const bRojo = sala.banderas.rojo;

    if (jugador.equipo === 'azul' && !jugador.tieneBandera && !bAzul.portador) {
      if (Math.hypot(bRojo.x - jugador.x, bRojo.y - jugador.y) < 50) {
        bRojo.portador = jugador.socketId;
        jugador.tieneBandera = true;
      }
    }
    if (jugador.equipo === 'rojo' && !jugador.tieneBandera && !bRojo.portador) {
      if (Math.hypot(bAzul.x - jugador.x, bAzul.y - jugador.y) < 50) {
        bAzul.portador = jugador.socketId;
        jugador.tieneBandera = true;
      }
    }

    if (jugador.tieneBandera) {
      if (jugador.equipo === 'azul' && Math.hypot(bAzul.x - jugador.x, bAzul.y - jugador.y) < 60) {
        this.declararGanador(sala, 'azul', jugador.apodo);
      } else if (jugador.equipo === 'rojo' && Math.hypot(bRojo.x - jugador.x, bRojo.y - jugador.y) < 60) {
        this.declararGanador(sala, 'rojo', jugador.apodo);
      }
    }
  }

  soltarBandera(sala, jugador) {
    if (sala.banderas.azul.portador === jugador.socketId) {
      sala.banderas.azul.portador = null;
      sala.banderas.azul.x = jugador.x;
      sala.banderas.azul.y = jugador.y;
    }
    if (sala.banderas.rojo.portador === jugador.socketId) {
      sala.banderas.rojo.portador = null;
      sala.banderas.rojo.x = jugador.x;
      sala.banderas.rojo.y = jugador.y;
    }
  }

  verificarCondicionesVictoria(sala) {
    if (sala.estado !== 'JUGANDO') return;

    let azulesvivos = 0, rojosvivos = 0;
    for (let j of sala.jugadores.values()) {
      if (!j.eliminado && !j.desconectado) {
        if (j.equipo === 'azul') azulesvivos++;
        else rojosvivos++;
      }
    }

    if (azulesvivos === 0 && rojosvivos > 0) {
      this.declararGanador(sala, 'rojo', 'Eliminación total');
    } else if (rojosvivos === 0 && azulesvivos > 0) {
      this.declararGanador(sala, 'azul', 'Eliminación total');
    }
  }

  declararGanador(sala, equipoGanador, apodoHeroe) {
    if (sala.estado !== 'JUGANDO') return;
    sala.estado = 'TERMINADA';
    clearInterval(sala.intervaloJuego);

    this.io.to(sala.codigo).emit('partida-terminada', {
      equipoGanador,
      apodoHeroe
    });
  }

  sincronizarSala(codigo) {
    const sala = this.salas.get(codigo);
    if (!sala) return;
    const lista = [];
    for (let j of sala.jugadores.values()) {
      lista.push({ apodo: j.apodo, equipo: j.equipo, listo: j.listo, eliminado: j.eliminado });
    }
    this.io.to(codigo).emit('actualizar-sala', {
      jugadores: lista,
      anfitrion: sala.anfitrion,
      modo: sala.modo
    });
  }

  sincronizarJuego(sala) {
    const datosJugadores = {};
    for (let [id, j] of sala.jugadores) {
      datosJugadores[id] = {
        x: j.x,
        y: j.y,
        equipo: j.equipo,
        energia: j.energia,
        eliminado: j.eliminado,
        tieneBandera: j.tieneBandera,
        apodo: j.apodo
      };
    }
    this.io.to(sala.codigo).emit('tick-juego', {
      jugadores: datosJugadores,
      triangulos: sala.triangulos,
      banderas: sala.banderas
    });
  }

  expulsarJugador(socket, idSocketTarget) {
    const info = this.conexionesJugadores.get(socket.id);
    if (!info) return;
    const sala = this.salas.get(info.codigoSala);
    if (!sala || sala.anfitrion !== socket.id) return;

    const targetSocket = this.io.sockets.sockets.get(idSocketTarget);
    if (targetSocket) {
      targetSocket.emit('expulsado');
      targetSocket.leave(sala.codigo);
    }
    sala.jugadores.delete(idSocketTarget);
    this.conexionesJugadores.delete(idSocketTarget);
    this.sincronizarSala(sala.codigo);
  }

  volverLobby(socket) {
    const info = this.conexionesJugadores.get(socket.id);
    if (!info) return;
    const sala = this.salas.get(info.codigoSala);
    if (!sala) return;

    const j = sala.jugadores.get(socket.id);
    if (j) {
      j.eliminado = false;
      j.energia = ENERGIA_INICIAL;
      j.enPregunta = false;
      j.pasoPregunta = 0;
      j.tieneBandera = false;
      j.x = j.equipo === 'azul' ? 500 : 3500;
      j.y = 2000;
    }
    if (sala.estado === 'TERMINADA') {
      sala.estado = 'LOBBY';
    }
    this.sincronizarSala(sala.codigo);
    socket.emit('regreso-lobby');
  }

  salirSala(socket) {
    const info = this.conexionesJugadores.get(socket.id);
    if (!info) return;
    const sala = this.salas.get(info.codigoSala);
    if (sala) {
      sala.jugadores.delete(socket.id);
      socket.leave(sala.codigo);
      if (sala.anfitrion === socket.id && sala.jugadores.size > 0) {
        sala.anfitrion = sala.jugadores.keys().next().value;
      }
      this.sincronizarSala(sala.codigo);
    }
    this.conexionesJugadores.delete(socket.id);
    socket.emit('salida-exitosa');
  }

  manejarDesconexion(socket) {
    const info = this.conexionesJugadores.get(socket.id);
    if (!info) return;
    const sala = this.salas.get(info.codigoSala);
    if (!sala) return;

    const jugador = sala.jugadores.get(socket.id);
    if (!jugador) return;

    jugador.desconectado = true;
    this.conexionesJugadores.delete(socket.id);

    const timeout = setTimeout(() => {
      sala.jugadores.delete(socket.id);
      sala.reconectando.delete(jugador.token);
      if (sala.anfitrion === socket.id && sala.jugadores.size > 0) {
        sala.anfitrion = sala.jugadores.keys().next().value;
      }
      this.sincronizarSala(sala.codigo);
    }, TIEMPO_RECONEXION * 1000);

    sala.reconectando.set(jugador.token, { timeout, jugador });
  }
}

module.exports = RoomManager;
