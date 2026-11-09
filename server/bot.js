/**
 * Lógica del Bot para el modo Contra un Bot
 */
class BotManager {
  constructor(roomManager, codigoSala) {
    this.roomManager = roomManager;
    this.codigoSala = codigoSala;
    this.idBot = 'bot-ia';
    setTimeout(() => {
      const sala = this.roomManager.salas.get(this.codigoSala);
      if (sala) {
        sala.jugadores.set(this.idBot, {
          socketId: this.idBot,
          apodo: 'Bot Nevado (IA)',
          equipo: 'rojo',
          x: 3500,
          y: 2000,
          energia: 100,
          eliminado: false,
          listo: true,
          tieneBandera: false,
          enPregunta: false
        });
      }
    }, 500);
  }

  actualizar(dt) {
    const sala = this.roomManager.salas.get(this.codigoSala);
    if (!sala) return;
    const bot = sala.jugadores.get(this.idBot);
    if (!bot || bot.eliminado) return;

    if (bot.energia < 50) {
      let masCercano = null;
      let minDist = Infinity;
      sala.triangulos.forEach(t => {
        if (t.activo) {
          const d = Math.hypot(t.x - bot.x, t.y - bot.y);
          if (d < minDist) {
            minDist = d;
            masCercano = t;
          }
        }
      });
      if (masCercano) {
        const ang = Math.atan2(masCercano.y - bot.y, masCercano.x - bot.x);
        bot.x += Math.cos(ang) * 4;
        bot.y += Math.sin(ang) * 4;
      }
    } else {
      const bAzul = sala.banderas.azul;
      const ang = Math.atan2(bAzul.y - bot.y, bAzul.x - bot.x);
      bot.x += Math.cos(ang) * 3.5;
      bot.y += Math.sin(ang) * 3.5;
    }
  }
}

module.exports = BotManager;
