/* ============================================================
   «Así te acompañamos entre consultas» — la animación del ciclo.
   Estilos y estados en /ciclo.css. Sin librerías.

   - Sin JS, sin IntersectionObserver o con «reducir movimiento», no hace
     nada: la sección ya está completa y quieta en el HTML.
   - Cada cosa se activa UNA vez, al entrar en pantalla:
       · el gancho: el contador sube de 0 a su número (el del HTML);
       · la escena: nodos, flechas y etiquetas en secuencia (CSS) y, al
         terminar, los puntitos recorren el anillo, ~9 s por vuelta.
   - Los puntitos solo corren con el anillo a la vista (escritorio), con la
     sección en pantalla y la pestaña visible.
   ============================================================ */
(function () {
  'use strict';

  var secciones = document.querySelectorAll('[data-ciclo]');
  if (!secciones.length) return;
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var CONTADOR_MS = 1600;
  var PASO_MS = 300;            // entre un nodo y el siguiente (como en ciclo.css)
  var PUNTOS_DESDE_MS = 4 * PASO_MS + 900; // cuando ya se trazó la última flecha
  var VUELTA_MS = 9000;

  function conComas(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function unaVez(el, umbral, alEntrar) {
    var io = new IntersectionObserver(function (entradas) {
      for (var i = 0; i < entradas.length; i++) {
        if (entradas[i].isIntersecting) {
          io.disconnect();
          alEntrar();
          return;
        }
      }
    }, { threshold: umbral });
    io.observe(el);
  }

  function contar(el, final) {
    var inicio = null;
    function paso(t) {
      if (inicio === null) inicio = t;
      var p = Math.min(1, (t - inicio) / CONTADOR_MS);
      var suave = 1 - Math.pow(1 - p, 3);
      el.textContent = conComas(Math.round(final * suave));
      if (p < 1) requestAnimationFrame(paso);
    }
    requestAnimationFrame(paso);
  }

  function puntos(seccion, svg) {
    var anillo = svg.querySelector('.ciclo-anillo');
    var circulos = svg.querySelectorAll('.ciclo-puntos circle');
    if (!anillo || !circulos.length || typeof anillo.getTotalLength !== 'function') return;

    var enPantalla = true;
    var corriendo = false;
    var origen = null;

    function visible() {
      return enPantalla && !document.hidden && svg.getClientRects().length > 0;
    }
    function cuadro(t) {
      if (!visible()) { corriendo = false; return; }
      if (origen === null) origen = t;
      var largo = anillo.getTotalLength();
      var avance = ((t - origen) % VUELTA_MS) / VUELTA_MS;
      for (var i = 0; i < circulos.length; i++) {
        var p = anillo.getPointAtLength(((avance + i / circulos.length) % 1) * largo);
        circulos[i].setAttribute('cx', p.x.toFixed(1));
        circulos[i].setAttribute('cy', p.y.toFixed(1));
      }
      requestAnimationFrame(cuadro);
    }
    function arrancar() {
      if (corriendo || !visible()) return;
      corriendo = true;
      requestAnimationFrame(cuadro);
    }

    new IntersectionObserver(function (entradas) {
      enPantalla = entradas[entradas.length - 1].isIntersecting;
      arrancar();
    }).observe(svg);
    document.addEventListener('visibilitychange', arrancar);
    window.addEventListener('resize', arrancar);

    seccion.classList.add('ciclo--vivo');
    arrancar();
  }

  Array.prototype.forEach.call(secciones, function (seccion) {
    var escena = seccion.querySelector('.ciclo-escena');
    var gancho = seccion.querySelector('.ciclo-gancho');
    var numero = seccion.querySelector('[data-ciclo-contador]');
    var final = numero ? parseInt(numero.textContent.replace(/\D/g, ''), 10) : NaN;

    seccion.classList.add('ciclo--anim');

    if (numero && gancho && final > 0) {
      numero.textContent = '0';
      unaVez(gancho, 0.6, function () { contar(numero, final); });
    }

    if (escena) {
      unaVez(escena, 0.25, function () {
        seccion.classList.add('ciclo--on');
        var svg = escena.querySelector('.ciclo-svg');
        if (svg) setTimeout(function () { puntos(seccion, svg); }, PUNTOS_DESDE_MS);
      });
    }
  });
})();
