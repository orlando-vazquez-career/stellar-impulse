# Progresión de cuenta

La simulación registra cambios oficiales de dueño de los nodos, destrucciones, pérdidas, bajas por nave y por disparo y el máximo de flota. El servidor calcula XP al producirse el resultado oficial del núcleo y guarda el premio una sola vez por cuenta y sala, incluso después de reiniciar.

Una partida solo otorga premios si hay un rival real: la IA, o una segunda cuenta en el otro
asiento. Sin IA y sin una segunda cuenta (rival vacío o invitado), la partida es de práctica:
no suma XP ni desafíos y el resultado lo indica (`practice: true`).

Victoria 100, derrota 40, hasta 50 por nodos y 25 por capturar el núcleo. La XP por rendimiento se multiplica por 0,25 en Fácil y por 0,6 en Escaramuza, redondeando abajo al final. Cada desafío nuevo otorga 50 XP fijos; Fácil no cumple desafíos. Los invitados tienen las 30 cartas iniciales (10 por nivel) y no guardan XP. Otras 14 cartas se desbloquean por nivel o desafío.

Cada 300 XP suma un nivel, empezando en nivel 1. El perfil expone XP, nivel, mejores progresos por partida y cartas desbloqueadas. Los mejores progresos no se suman entre partidas para desafíos que exigen una sola partida. Destruir señuelos no da bajas ni recompensas. Retirar una nave de combate cuenta como pérdida para Intocable.

## Campaña 1v1

La sala `campaign` guarda el premio de cada cuenta una sola vez por campaña al entrar en
resultados, y lo envía a cada jugador en `campaign_end` (`reward`). El núcleo final paga 125
al ganador y 40 al perdedor; un empate paga 40 a cada uno. Un abandono paga 40 al jugador que
sigue en la sala solo si ya se completó al menos un sector, y nada a quien se fue. Una campaña
anulada no paga. Los sectores de campaña todavía no registran estadísticas por partida, así que
no cumplen desafíos.

Cada cuenta recuerda los últimos 100 resultados (XP, desafíos y cartas desbloqueadas, sin una copia del perfil) para responder igual si una sala vuelve a informar el mismo resultado. Si el servidor no puede guardar, el resultado llega con `saveFailed: true` y el perfil queda como estaba.

Los datos antiguos de cuentas siguen siendo válidos. XP, desafíos y premios se guardan en el mismo archivo del sistema de cuentas, mediante sustitución atómica. El cliente no puede enviar XP, pools desbloqueados ni resultados. El perfil es privado y exige una sesión válida.
