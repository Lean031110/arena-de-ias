export function PanelGuia() {
  return (
    <section className="panel guia" aria-labelledby="titulo-guia">
      <h2 className="panel__titulo" id="titulo-guia">
        Guía de Arena de IAs
      </h2>

      <h3>Cómo usar la arena</h3>
      <p>
        Elige un juego y dos agentes (puedes incluirte como <em>Humano</em> en partidas paso a
        paso), fija un presupuesto de búsqueda y una semilla, y lanza la partida o una evaluación
        completa. En las evaluaciones, ambos agentes alternan lados en cada encuentro (diseño
        pareado) y el progreso que ves es el recuento real de partidas completadas.
      </p>

      <h3>Niveles de agentes</h3>
      <ul>
        <li>
          <strong>Nivel 1 · Aleatorio</strong>: referencia mínima; elige jugadas legales al azar con
          semilla.
        </li>
        <li>
          <strong>Nivel 2 · Heurístico</strong>: gana si puede, bloquea amenazas inmediatas y usa la
          evaluación posicional del juego.
        </li>
        <li>
          <strong>Nivel 3 · Minimax α-β</strong>: búsqueda exhaustiva con poda y presupuestos
          estrictos de profundidad, nodos y tiempo.
        </li>
        <li>
          <strong>Nivel 4 · MCTS</strong>: búsqueda de árbol Monte Carlo (UCT) con número exacto de
          simulaciones.
        </li>
        <li>
          <strong>Nivel 5 · Red neuronal</strong>: pendiente (Fase 2). Su ficha existe para mostrar
          el estado real del proyecto, no para simular capacidades.
        </li>
      </ul>

      <h3>Integridad de los datos</h3>
      <p>
        Esta aplicación no muestra cifras inventadas: si un dato no existe verás «Sin datos» o
        «Pendiente». Cada partida se valida reproduciendo su secuencia de jugadas; las huellas de
        integridad (FNV-1a, no criptográficas) detectan corrupción accidental, pero no prueban que
        un evento ocurrió. Los intervalos de confianza de Wilson al 95 % acompañan a cada
        puntuación y <em>no son garantías absolutas</em>.
      </p>

      <h3>Reproducibilidad</h3>
      <p>
        Toda la aleatoriedad del dominio fluye por un generador con semilla registrada en cada
        partida. La misma semilla reproduce la misma secuencia de jugadas y el mismo resultado en
        el mismo motor de JavaScript. Los tiempos medidos varían entre ejecuciones (por eso quedan
        fuera de la huella).
      </p>

      <h3>Estado del proyecto y límites actuales</h3>
      <ul>
        <li>Fase 0 (arquitectura y plan) y Fase 1 (motor y 4 niveles) completadas.</li>
        <li>
          6 de 15 variantes de juego implementadas; el resto está catalogado como pendiente para la
          Fase 5.
        </li>
        <li>
          Tres en raya 3×3 está <strong>resuelto localmente</strong> (empate con juego perfecto,
          verificado por solucionador exhaustivo). El resto de juegos no está resuelto localmente y
          ninguna tasa de derrotas observada debe interpretarse como invencibilidad garantizada.
        </li>
        <li>
          Entrenamiento de redes, equipos, torneos, Elo y Glicko-2: fases 2 a 4. Sus paneles
          muestran «Sin datos» hasta entonces.
        </li>
        <li>
          Una evaluación interrumpida (recarga o cierre) no continúa sola: las partidas ya
          completadas quedan guardadas y el evento se registra. La reanudación con checkpoints
          llega en la Fase 2.
        </li>
      </ul>

      <h3>Para desarrolladores</h3>
      <p>
        El código y su documentación están en el repositorio: <code>docs/ARQUITECTURA.md</code>{' '}
        (arquitectura), <code>docs/JUEGOS.md</code> (reglas de cada variante),{' '}
        <code>docs/DECISIONES.md</code> (registro de decisiones),{' '}
        <code>docs/CRITERIOS_ACEPTACION.md</code> (criterios por fase) y{' '}
        <code>docs/INFORMES/</code> (informes verificables). El dominio es TypeScript puro sin
        dependencia de React y se prueba con Vitest.
      </p>
    </section>
  );
}
