/**
 * Servidor principal con Express y Socket.IO
 * Gestiona conexiones, seguridad, rate limiting y archivos estáticos.
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const RoomManager = require('./rooms');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, '../public')));

const roomManager = new RoomManager(io);

// Control básico de rate limit por IP para códigos de sala incorrectos
const ipAttempts = new Map();

io.on('connection', (socket) => {
  const clientIp = socket.handshake.address;

  socket.on('crear-sala', ({ apodo, modo }) => {
    try {
      const sala = roomManager.crearSala(socket, apodo, modo);
      socket.emit('sala-creada', { codigo: sala.codigo, modo: sala.modo });
    } catch (err) {
      socket.emit('error-servidor', err.message);
    }
  });

  socket.on('unirse-sala', ({ codigo, apodo, tokenReconexion }) => {
    const now = Date.now();
    const attempts = ipAttempts.get(clientIp) || { count: 0, time: now };
    if (now - attempts.time < 60000 && attempts.count > 10) {
      return socket.emit('error-servidor', 'Demasiados intentos. Espera un minuto.');
    }

    try {
      const resultado = roomManager.unirseSala(socket, codigo, apodo, tokenReconexion);
      if (resultado.error) {
        attempts.count++;
        attempts.time = now;
        ipAttempts.set(clientIp, attempts);
        return socket.emit('error-servidor', resultado.error);
      }
      socket.emit('unido-exitoso', resultado);
    } catch (err) {
      socket.emit('error-servidor', err.message);
    }
  });

  socket.on('cambiar-equipo', ({ equipoDeseado }) => {
    roomManager.cambiarEquipo(socket, equipoDeseado);
  });

  socket.on('toggle-listo', () => {
    roomManager.toggleListo(socket);
  });

  socket.on('iniciar-partida', () => {
    roomManager.iniciarPartida(socket);
  });

  socket.on('mover', (data) => {
    roomManager.actualizarMovimiento(socket, data);
  });

  socket.on('comer-triangulo', ({ idTriangulo }) => {
    roomManager.procesarTriangulo(socket, idTriangulo);
  });

  socket.on('responder-pregunta', ({ paso, respuesta }) => {
    roomManager.procesarRespuestaPregunta(socket, paso, respuesta);
  });

  socket.on('expulsar-jugador', ({ idSocketTarget }) => {
    roomManager.expulsarJugador(socket, idSocketTarget);
  });

  socket.on('volver-lobby', () => {
    roomManager.volverLobby(socket);
  });

  socket.on('salir-sala', () => {
    roomManager.salirSala(socket);
  });

  socket.on('disconnect', () => {
    roomManager.manejarDesconexion(socket);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
