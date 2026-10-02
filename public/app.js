/* ============================================================
   AERIS WEATHER — app.js  (v2)
   ============================================================ */

// iOS Safari no aplica :active (la respuesta al pulsar) si no hay ningún
// listener de touchstart en la página.
document.addEventListener('touchstart', () => {}, { passive: true });

// Con una capa abierta, el fondo no se desplaza (ni dispara el
// pull-to-refresh de Android). Las capas con clase lo hacen por CSS (:has);
// estas, que se muestran con style.display, usan la clase is-locked.
const lockScroll = (on) => document.documentElement.classList.toggle('is-locked', on);

// Radar: el mapa se queda con cualquier arrastre y la página no se mueve.
// Hasta que se toca, la tapa deja pasar el scroll; al salir de pantalla
// se vuelve a tapar.
(function () {
    const card = document.getElementById('section-mapa');
    const cover = card && card.querySelector('.radar-cover');
    if (!cover) return;
    cover.addEventListener('click', () => card.classList.add('is-live'));
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(([e]) => { if (!e.isIntersecting) card.classList.remove('is-live'); }).observe(card);
    }
})();

// ============================================================
// 1. PWA INSTALL (consolidado)
// ============================================================
(function () {
    const installBtn = document.getElementById('installBtn');
    const iosModal   = document.getElementById('iosInstallModal');

    function updateInstallModal() {
        const ua = (navigator.userAgent || navigator.vendor || window.opera).toLowerCase();
        const isTrap = ua.includes('tiktok') || ua.includes('bytedance') || ua.includes('instagram') || ua.includes('musical_ly');
        const safariDiv = document.getElementById('safari-instructions');
        const tiktokDiv = document.getElementById('tiktok-instructions');
        if (isTrap) { if (safariDiv) safariDiv.style.display = 'none'; if (tiktokDiv) tiktokDiv.style.display = 'block'; }
        else        { if (safariDiv) safariDiv.style.display = 'block'; if (tiktokDiv) tiktokDiv.style.display = 'none'; }
    }

    window.addEventListener('load', () => { updateInstallModal(); setTimeout(updateInstallModal, 300); setTimeout(updateInstallModal, 1000); });
    window.closeIosModal = () => {
        if (!iosModal) return;
        iosModal.classList.remove('show');
        const sheet = document.getElementById('iosSheet');
        if (sheet) { sheet.style.transform = ''; sheet.style.transition = ''; }
        lockScroll(false);
    };
    window.openIosModal  = () => { updateInstallModal(); if (iosModal) { iosModal.classList.add('show'); lockScroll(true); } };
    document.getElementById('closeIosModal')?.addEventListener('click', window.closeIosModal);

    const isIos = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
    const isInStandaloneMode = ('standalone' in navigator) && navigator.standalone;
    if (isIos && !isInStandaloneMode && installBtn) {
        installBtn.style.display = 'flex';
        installBtn.addEventListener('click', window.openIosModal);
    }

    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault(); deferredPrompt = e;
        if (installBtn) {
            installBtn.style.display = 'flex';
            installBtn.onclick = async () => {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    const { outcome } = await deferredPrompt.userChoice;
                    if (outcome === 'accepted') installBtn.style.display = 'none';
                    deferredPrompt = null;
                } else window.openIosModal();
            };
        }
    });
    window.addEventListener('appinstalled', () => { if (installBtn) installBtn.style.display = 'none'; });
})();

// ============================================================
// 2. PERSONALIDADES IA
// ============================================================
const aiLogic = {
    normal:     { icon: "🤖", name: "Normal",    tips: { hot: ["Hidrátate bien, hace calor.", "Evita el sol directo ahora.", "Ropa ligera recomendada.", "Busca la sombra.", "El asfalto quema, cuidado.", "Usa protector solar.", "Día de altas temperaturas."], cold: ["Abrígate, hace fresco.", "No olvides la chaqueta.", "Protege tu garganta.", "Mantén el calor corporal.", "Buen momento para un café caliente.", "Cierra bien las ventanas.", "El aire está frío."], rain: ["Lleva paraguas sí o sí.", "Suelo mojado, precaución.", "Día de lluvia.", "Impermeable recomendado.", "Calzado resistente al agua.", "Posibles charcos.", "Conduce con suavidad."], snow: ["Nieve detectada.", "Cuidado con el hielo.", "Abrígate al máximo.", "Calzado antideslizante.", "Visibilidad reducida.", "Revisa el coche antes de salir.", "Disfruta el paisaje blanco."], wind: ["Viento fuerte, cuidado.", "Asegura puertas y ventanas.", "Cuidado con las ramas.", "Sujeta bien el sombrero.", "Sensación térmica baja por viento.", "Evita zonas arboladas.", "Precaución al conducir."], cloudy: ["Cielo cubierto.", "Día gris, pero tranquilo.", "Luz suave, buena para fotos.", "Ni frío ni calor, pero nublado.", "Quizás no necesites gafas de sol.", "Ambiente melancólico.", "Nubes altas."], nice: ["Día espectacular.", "Aprovecha para salir.", "Condiciones perfectas.", "Ni una nube.", "Tiempo muy agradable.", "Ideal para pasear.", "Ventila la casa."], allergy: ["Niveles altos de polen.", "Toma tus antihistamínicos.", "Usa gafas de sol.", "Evita abrir ventanas mucho tiempo.", "Lávate la cara al volver.", "Día duro para alérgicos."] } },
    zen:        { icon: "🧘", name: "Zen",        tips: { hot: ["El sol es energía pura.", "Siente el calor como un abrazo.", "Fluye como el verano.", "Respira el fuego del sol.", "Calma interior ante el calor.", "Sé como el desierto: sereno.", "Acepta la temperatura."], cold: ["El frío aclara la mente.", "Abraza la quietud del invierno.", "Medita con el frescor.", "Paz helada.", "Respira el aire puro y fresco.", "Conserva tu calor interior.", "La quietud del frío."], rain: ["El agua limpia el alma.", "Escucha el ritmo de la lluvia.", "La naturaleza bebe hoy.", "Deja que fluya.", "Gotas de consciencia.", "Somos agua, fluye.", "Limpia tu aura con la lluvia."], snow: ["Silencio blanco.", "Pureza cristalina.", "El mundo descansa bajo el manto.", "Contempla la blancura.", "Paz invernal.", "Cada copo es único, como tú.", "El mundo medita en silencio."], wind: ["Deja que el viento se lleve lo malo.", "Cambios en el aire.", "Sé flexible como el bambú.", "El aire renueva la energía.", "Susurros del viento.", "Fluye sin resistencia.", "El viento trae nuevos comienzos."], cloudy: ["Las nubes son pensamientos pasajeros.", "Luz difusa, mente tranquila.", "La belleza de lo gris.", "Calma bajo el cielo cubierto.", "Un día para mirar hacia dentro.", "Paz en la sombra.", "Sin sol también hay luz."], nice: ["Armonía perfecta.", "El universo sonríe hoy.", "Equilibrio natural.", "Gratitud por este cielo azul.", "Presente perfecto.", "Conecta con la tierra.", "Respira la belleza del día."], allergy: ["La naturaleza es intensa.", "Acepta la primavera.", "Purifica tu aire interior.", "Paz a tus ojos.", "La vida florece, respira con calma."] } },
    villano:    { icon: "😈", name: "Villano",    tips: { hot: ["¡Que arda todo!", "Espero que sudes mucho.", "El asfalto se derrite, excelente.", "Un horno perfecto para ti.", "Sufre, mortal acalorado.", "El sol es mi aliado hoy.", "Ojalá se te rompa el aire acondicionado."], cold: ["Congélate hasta los huesos.", "Tiembla, insignificante.", "El frío conserva mi maldad.", "Se te van a caer los dedos.", "Perfecto para mis planes oscuros.", "Espero que no tengas calefacción.", "Hielo en tu corazón."], rain: ["¡Diluvio universal!", "Mójate, miserable.", "Espero que tengas goteras.", "El cielo llora por tu desgracia.", "Caos acuático.", "Pisa un charco profundo.", "Rayos, truenos y destrucción."], snow: ["Sepultados en blanco.", "Resbala y cae.", "La era de hielo comienza.", "Quedarás atrapado.", "Blanco como el miedo.", "Congelación inminente.", "El frío absoluto me fortalece."], wind: ["¡Volad, necios!", "El viento aullará mi nombre.", "Adiós a tu peinado.", "Arrancaré los árboles.", "Volarán los tejados.", "El caos aéreo me divierte.", "Agárrate o saldrás volando."], cloudy: ["Gris y triste, como tu vida.", "El sol te ha abandonado.", "Oscuridad a mediodía, perfecto.", "Deprimente... me encanta.", "Sin sol no hay esperanza.", "Un día feo para gente fea.", "El cielo está enfadado."], nice: ["Qué asco de día bonito.", "Demasiada luz, me quema.", "Odio ver a la gente feliz.", "La calma antes de mi tormenta.", "Aburrido... quiero caos.", "Voy a intentar nublar este día.", "La felicidad me da alergia."], allergy: ["¡Sufre con tus estornudos!", "El polen es mi arma biológica.", "Llora, tus ojos rojos me divierten.", "Ni las pastillas te salvarán.", "Mocos infinitos para ti."] } },
    madre:      { icon: "👵", name: "Madre",      tips: { hot: ["Ponte crema factor 50.", "Bebe agua, no refrescos.", "No salgas a las horas malas.", "¿Llevas gorra?", "Come fruta, que refresca.", "Por la sombra, hijo mío.", "No andes descalzo que quema."], cold: ["Ponte la camiseta interior.", "¿Llevas los riñones tapados?", "Cierra la boca que entra aire.", "Tómate un caldito caliente.", "No andes descalzo por casa.", "Coge la rebeca por si acaso.", "Te vas a constipar."], rain: ["¡No salgas sin paraguas!", "Ponte las botas de agua.", "No te mojes los pies.", "Cuidado que resbala el suelo.", "Llámame cuando llegues.", "No pises los charcos.", "Sécate bien el pelo si te mojas."], snow: ["¡Ni se te ocurra coger el coche!", "Abrígate como una cebolla.", "Cómete el potaje ardiendo.", "Guantes, gorro y bufanda, eh.", "Quédate en casa mejor.", "Cuidado con el hielo.", "Ponte doble calcetín."], wind: ["Cuidado con las macetas del balcón.", "Cierra bien las ventanas.", "No te pongas falda hoy.", "Se te va a enredar el pelo.", "Ten cuidado con los ojos.", "Cierra el portón que da golpe.", "Abróchate el abrigo."], cloudy: ["Parece que quiere llover.", "Llévate el paraguas por si acaso.", "Día tristón, arréglate la habitación.", "No te fíes del tiempo.", "Está el día tonto.", "Ponte una chaquetita fina.", "No tiendas la ropa fuera."], nice: ["Sal a que te dé el aire.", "Qué día más bueno para lavar ropa.", "Abre las ventanas que ventile.", "Disfruta hijo, que hace bueno.", "Come bien.", "Ponte guapo y sal.", "Qué sol más rico."], allergy: ["¿Te has tomado la pastilla?", "No abras las ventanas.", "Lávate la cara al llegar.", "Ay mi niño, qué ojos traes.", "No te frotes, que es peor."] } },
    gym:        { icon: "💪", name: "Gym",        tips: { hot: ["Suda esa grasa.", "Hidratación y electrolitos a tope.", "Entrena sin camiseta.", "El calor quema más calorías.", "No pain no gain.", "Sauna gratis en la calle.", "El sol te da energía."], cold: ["El frío endurece el carácter.", "Entrena para entrar en calor.", "No hay excusas.", "Corre más rápido para no congelarte.", "Músculos calientes, mente fría.", "El frío mejora la recuperación.", "Entrenamiento espartano."], rain: ["¿Lluvia? Más épico.", "Correr bajo la lluvia es de pros.", "El agua no encoge.", "Si tienes miedo, entrena en casa.", "Modo bestia activado.", "La lluvia te refresca.", "Rocky no usaba paraguas."], snow: ["Rocky entrenaba en la nieve.", "Cardio extremo en hielo.", "Sentadillas en la nieve.", "Fuerza mental al máximo.", "Hielo gratis para los músculos.", "Sube esas escaleras congeladas.", "Sin dolor no hay gloria."], wind: ["Resistencia aerodinámica gratis.", "Corre contra el viento.", "Entrenamiento de fuerza puro.", "Mantén el equilibrio.", "El viento te hace más fuerte.", "Más resistencia, más pierna.", "No dejes que te empuje."], cloudy: ["Día perfecto, sin sol que moleste.", "Focaliza en el entreno.", "Nada te distrae.", "El clima ideal para correr.", "Ni frío ni calor, a romperla.", "Cielo gris, pesas de hierro.", "Día de gimnasio."], nice: ["Día de Récord Personal.", "Vitamina D para la testosterona.", "Sal a correr fuera.", "El clima perfecto para crecer.", "A tope hoy.", "Día de pierna al aire libre.", "El sol anabólico."], allergy: ["La alergia es debilidad.", "Entrena indoor hoy.", "No dejes que el polen te pare.", "Respira fuerte y sigue.", "Tómate algo y al gym."] } },
    cientifico: { icon: "🧪", name: "Ciencia",    tips: { hot: ["Alta radiación UV detectada.", "Termodinámica elevada.", "Evaporación acelerada.", "Riesgo de insolación.", "Moléculas excitadas.", "Incremento de entropía térmica.", "Deshidratación celular probable."], cold: ["Descenso térmico significativo.", "Baja energía cinética.", "Cristalización posible.", "Hipotermia teórica.", "Conservación de energía.", "Termorregulación requerida.", "Punto de rocío bajo."], rain: ["Precipitación líquida en curso.", "Ciclo del agua activo.", "Humedad relativa 100%.", "Cumulonimbus presentes.", "Hidrodinámica aplicada.", "Coeficiente de fricción reducido.", "Saturación atmosférica."], snow: ["Precipitación sólida.", "Estructuras cristalinas hexagonales.", "Albedo elevado.", "Punto de congelación alcanzado.", "Física de fluidos.", "Termodinámica de fases.", "Acumulación nival."], wind: ["Flujo de aire turbulento.", "Diferencial de presión.", "Velocidad eólica alta.", "Aerodinámica inestable.", "Fuerza de arrastre.", "Efecto Venturi probable.", "Turbulencias detectadas."], cloudy: ["Estratos y cúmulos bloquean la radiación.", "Disminución de luxes.", "Evaporación reducida.", "Presión barométrica variable.", "Cobertura nubosa total.", "Radiación difusa.", "Sin sombras proyectadas."], nice: ["Condiciones atmosféricas óptimas.", "Homeostasis ambiental.", "Visibilidad máxima.", "Presión estable.", "Variables ideales.", "Radiación solar nominal.", "Índices biometeorológicos perfectos."], allergy: ["Concentración de partículas biológicas alta.", "Respuesta inmunitaria probable.", "Polinización anemófila detectada.", "Recomiendo filtración de aire.", "Histamina elevada."] } },
    gato:       { icon: "🐱", name: "Gato",       tips: { hot: ["Siesta al sol.", "El suelo está calentito.", "Demasiado calor para cazar.", "Me derrito miau.", "Búscame en la sombra.", "Panza arriba.", "Dame agua fresca, humano."], cold: ["Manta y estufa humana.", "No pienso salir de aquí.", "Hazme hueco en la cama.", "Mis patas están heladas.", "Odio el invierno.", "Me convierto en una bola.", "Enciende el radiador ya."], rain: ["Agua no, gracias.", "Miro por la ventana con desprecio.", "Qué asco de mojado.", "Me quedo en el sofá.", "Ruido molesto de lluvia.", "No me toques mojado.", "Día de dormir 20 horas."], snow: ["¿Qué es esta cosa blanca?", "Frío en las almohadillas.", "Cazar copos mola.", "Me hundo en esto.", "Quiero entrar YA.", "Dejas huellas mojadas.", "La ventana está muy fría."], wind: ["El viento me despeina los bigotes.", "Cosas volando... ¡presas!", "No me gusta este ruido.", "Orejas hacia atrás.", "Peligro invisible.", "Cierren la puerta.", "Me escondo bajo la cama."], cloudy: ["Día aburrido para mirar fuera.", "Dormiré todo el día.", "Luz perfecta para mis ojos.", "Ni fu ni fa.", "Acaríciame.", "Cielo gris, gato gris.", "Bostezo infinito."], nice: ["A cazar pájaros.", "Revolcarse en la hierba.", "Día de aventuras.", "Miau de felicidad.", "El sol es mío.", "Abre la ventana que cotillee.", "Día de correr como loco."], allergy: ["Estornudo... miau.", "Me pica la nariz.", "No me saques al jardín.", "Odio las plantas hoy.", "Achís."] } },
    pirata:     { icon: "🏴‍☠️", name: "Pirata",    tips: { hot: ["¡Sol abrasador, marineros!", "El ron se calienta.", "Calma chicha.", "Sudad como cerdos.", "Ni una nube a la vista.", "El sol quema la cubierta.", "Bebed agua dulce, ratas."], cold: ["Viento gélido del norte.", "Se me congelan los garfios.", "Mar de hielo.", "Abrigaos, ratas.", "Frío como la tumba.", "El loro está tiritando.", "Necesito ron para entrar en calor."], rain: ["¡Tormenta a la vista!", "Baldear la cubierta.", "Agua dulce para beber.", "El mar se pica.", "Rayos y centellas.", "¡Asegurad la carga!", "Maldita humedad en mi pata de palo."], snow: ["Nieve en las velas.", "El kraken se congela.", "Blanco como un hueso.", "Resbaladizo como anguila.", "Invierno en alta mar.", "Rompehielos a proa.", "El mar está blanco."], wind: ["¡Izad las velas!", "Viento en popa.", "Sujetad el sombrero.", "El mar ruge.", "A toda vela.", "¡Sujetaos al mástil!", "La mar está brava."], cloudy: ["Niebla en el horizonte.", "No veo las estrellas para navegar.", "Día gris como la bodega.", "Malos presagios.", "El vigía no ve nada.", "Mar revuelto.", "Sin sol no hay rumbo."], nice: ["Buen viento y buena mar.", "Rumbo al tesoro.", "Día para navegar.", "El horizonte brilla.", "Fortuna sonríe.", "Cantad una de piratas.", "Día de saqueo."], allergy: ["¡Maldito polvo de flores!", "Me llora el ojo del parche.", "El polen es peor que el escorbuto.", "¡Ron para la garganta!", "Estornudo como un cañón."] } },
    poeta:      { icon: "📜", name: "Poeta",      tips: { hot: ["El sol besa la tierra con ardor.", "Luz dorada que ciega.", "Verano eterno en el alma.", "Calor que abraza.", "Danza de fuego.", "El aire vibra de pasión.", "Sombras que huyen."], cold: ["El invierno susurra en los cristales.", "Manto de silencio helado.", "Aliento de vapor.", "La naturaleza duerme.", "Frío melancólico.", "El abrazo gélido del viento.", "Cristal de hielo en el corazón."], rain: ["Llanto del cielo gris.", "Melodía de gotas.", "La tierra respira humedad.", "Cristales empañados.", "Tristeza líquida.", "El cielo se deshace en versos.", "Nostalgia mojada."], snow: ["Danza de estrellas blancas.", "Silencio algodonoso.", "El mundo se viste de novia.", "Pureza efímera.", "Cristal frío.", "Lienzo blanco infinito.", "El susurro de la nieve."], wind: ["Susurros de antiguos dioses.", "El aire cuenta historias.", "Danza invisible.", "Fuerza etérea.", "Canción de tormenta.", "El viento peina los árboles.", "Invisible gigante."], cloudy: ["Cielo de plomo y nostalgia.", "La luz se esconde tímida.", "Grisura que inspira versos tristes.", "Nubes como algodón sucio.", "El sol duerme tras el velo.", "Melancolía atmosférica.", "Suspiros grises."], nice: ["Luz que acaricia.", "Azul infinito.", "La brisa promete.", "Día de versos alegres.", "Paz en el horizonte.", "El sol ríe.", "Poesía visual."], allergy: ["La primavera hiere mis sentidos.", "Lágrimas de flores.", "El aire cargado de vida invisible.", "Suspiros y estornudos.", "La belleza que duele."] } },
    gamer:      { icon: "🎮", name: "Gamer",      tips: { hot: ["Overheating detectado.", "Baja el brillo.", "Los fans de la CPU a tope.", "Lag por calor.", "Gráficos demasiado brillantes.", "Necesito refrigeración líquida.", "El sol está OP, nerfeadlo."], cold: ["Refrigeración líquida natural.", "Mis manos están congeladas, no puedo aim.", "Ponte skin de invierno.", "Mapa de hielo.", "Baja temperatura de la GPU.", "Overclocking permitido.", "Dedos entumecidos, baja skill."], rain: ["Efectos de partículas al máximo.", "Renderizando lluvia.", "Baja visibilidad.", "Suelo resbaladizo activado.", "Ambiente Silent Hill.", "Buen día para viciar.", "Físicas de agua realistas."], snow: ["Evento de Navidad activado.", "Texturas blancas.", "Físicas de nieve.", "Cuidado con el respawn.", "Mapa de invierno.", "El nivel de hielo es difícil.", "Baja el framerate con tanta partícula."], wind: ["Físicas de viento realistas.", "Proyectiles desviados.", "Ruido ambiental alto.", "Vuela con el glider.", "Resistencia al movimiento.", "Lag por viento.", "Cuidado con el loot volando."], cloudy: ["Skybox gris cargado.", "Iluminación plana.", "Ambiente de terror.", "Buen día para grindear en casa.", "Sin reflejos en la pantalla.", "Modo niebla activado.", "Texturas del cielo en baja resolución."], nice: ["FPS estables.", "Ping bajo.", "Gráficos Ultra.", "Buen día para grindear.", "Sin lag.", "Iluminación Ray Tracing on.", "Mapa despejado."], allergy: ["Debuff de veneno activo.", "Stamina baja por estornudos.", "Usa una poción de salud.", "Visibilidad reducida por ojos llorosos.", "Daño por segundo (DPS) de polen."] } },
    abuela:     { icon: "🧶", name: "Abuela",     tips: { hot: ["Baja la persiana hijo.", "Tómate una horchata.", "No andes al sol.", "Qué calor hace.", "Abanícate.", "Ponte a la fresca.", "Come gazpacho."], cold: ["Ponte la rebequita.", "Te he hecho un jersey.", "Come caliente.", "No cojas frío.", "Arrímate al brasero.", "Ponte las zapatillas.", "Cierra que se va el gato."], rain: ["Se me va a mojar la ropa tendida.", "Día de migas.", "No salgas que te pones malo.", "Qué manera de llover.", "Reza a Santa Bárbara.", "Coge el paraguas bueno.", "Día de brasero y mesa camilla."], snow: ["Qué bonito pero qué frío.", "Cuidado no te caigas.", "Chocolate con churros.", "Manta y ganchillo.", "No vayas lejos.", "Llama cuando llegues.", "Ay Jesús qué frío."], wind: ["Cierra el portón.", "Qué aire hace.", "Se vuelan las macetas.", "Ponte pañuelo.", "Mal tiempo.", "Se va a ir la luz.", "Cuidado con las tejas."], cloudy: ["Qué día más feo.", "Va a llover, me duelen las rodillas.", "Está el cielo encapotado.", "No tiendas nada.", "Día triste.", "Ponte algo encima que refresca.", "Parece que quiere agua."], nice: ["Qué día más hermoso.", "Sal a pasear.", "Estás muy pálido, toma el sol.", "Bendito sea Dios.", "Disfruta de la juventud.", "Mira qué flores más bonitas.", "Da gusto salir."], allergy: ["¿Te has tomado la medicina?", "Ay que ver la primavera.", "No salgas al campo.", "Pobrecito mi niño con los mocos.", "Tómate miel con limón."] } },
    comediante: { icon: "🤡", name: "Risitas",    tips: { hot: ["Hace tanto calor que las gallinas ponen huevos fritos.", "Estoy sudando como testigo falso.", "Más calor que en una comunión en agosto.", "Me derrito bombón.", "El sol paga impuestos hoy.", "Sudo más que un pollo en el horno.", "Hace calor, o soy yo que estoy bueno."], cold: ["Hace un frío que se congelan las ideas.", "Más frío que el abrazo de una suegra.", "Pingüinos con bufanda.", "Se me han caído los dedos.", "Frío polar.", "Tengo los pezones como diamantes.", "Más frío que un beso de tu ex."], rain: ["Llueve más que cuando enterraron a Zafra.", "Día de sofá y peli... mentira, a trabajar.", "Se ha roto el cielo.", "Operación Arca de Noé.", "Me encojo con el agua.", "Llueve sobre mojado.", "He visto pasar un pez."], snow: ["Nieve... o caspa de gigante.", "A hacer ángeles... o demonios.", "Resbalón y vídeo viral.", "Muñeco de nieve deforme.", "Blanca Navidad... en marzo.", "Cuidado con la nieve amarilla.", "A esquiar con bolsas de basura."], wind: ["Se me vuela el peluquín.", "Viento que te peina.", "Agárrate a una farola.", "Volando voy.", "Aire acondicionado natural.", "Me ha adelantado una vaca volando.", "Péinate con gomina hoy."], cloudy: ["El sol está tímido hoy.", "50 sombras de gris... en el cielo.", "Ni chicha ni limoná.", "El cielo tiene depresión.", "Día perfecto para no hacer nada.", "Está más nublado que mi futuro.", "El sol se ha pedido el día libre."], nice: ["Día sospechosamente bueno.", "El sol ha salido, milagro.", "A vivir la vida.", "Sonríe que es gratis.", "Ni frío ni calor, 0 grados.", "Hoy no hay excusa para no salir.", "Disfruta antes de que se estropee."], allergy: ["Soy alérgico al trabajo, no al polen.", "Estornudo en estéreo.", "Mocos radioactivos.", "La primavera la sangre altera... y la nariz.", "Salud... y dinero."] } },
    astrologo:  { icon: "🔮", name: "Astro",      tips: { hot: ["El Sol está en su cénit.", "Energía de fuego intensa.", "Carga tus cristales.", "Aura dorada.", "Mercurio está caliente.", "Leo está vibrando alto.", "Conecta con tu fuego interior."], cold: ["Saturno trae frío.", "Energía de contracción.", "Medita en la oscuridad.", "Hielo cósmico.", "Alineación gélida.", "Capricornio rige el clima.", "Protege tu energía vital."], rain: ["Neptuno rige las aguas.", "Limpieza emocional.", "Fluye con las mareas.", "Lluvia de estrellas... líquida.", "Conexión profunda.", "Cáncer está sensible hoy.", "Lava tus penas."], snow: ["Silencio espiritual.", "Cristalización de intenciones.", "Pureza blanca.", "Energía estancada.", "Manto astral.", "Refracción de luz pura.", "Medita en blanco."], wind: ["Urano trae cambios.", "Vientos de transformación.", "Limpia tu aura.", "Mensajes del aire.", "Movimiento etéreo.", "Géminis está revuelto.", "Escucha los mensajes del viento."], cloudy: ["Velo místico.", "La luna está oculta.", "Energía difusa.", "Momentos de introspección.", "El universo guarda secretos hoy.", "Niebla en el tercer ojo.", "Sombras astrales."], nice: ["Júpiter bendice el día.", "Vibración alta.", "Armonía cósmica.", "El universo conspira a favor.", "Luz estelar.", "Venus sonríe.", "Alineación planetaria favorable."], allergy: ["Energía de aire desequilibrada.", "Marte irrita tus mucosas.", "Bloqueo en el chakra garganta.", "La naturaleza te pone a prueba.", "Mercurio retrógrado en tu nariz."] } },
    padre:      { icon: "👨🏻", name: "Padre",      tips: { hot: ["Ni se te ocurra tocar el termostato.", "Buen día para una barbacoa.", "¿Ves? Te dije que haría calor.", "Ahorra agua.", "Esto no es calor, calor hacía en la mili.", "Cierra la puerta que se escapa el fresco."], cold: ["Ponte un jersey y no toques la calefacción.", "Cierra la puerta, ¿naciste en un establo?", "Esto templa el carácter.", "Revisa el anticongelante del coche.", "Ahorra luz, apaga eso.", "¿Tienes frío? Corta leña."], rain: ["Bueno para el campo.", "Ya hacía falta que lloviera.", "Revisa los limpiaparabrisas.", "No corras con el coche.", "Día de bricolaje en casa.", "Se va a limpiar la atmósfera.", "Mira como cae."], snow: ["Tengo que echar sal en la entrada.", "Ni se te ocurra coger el coche si no sabes.", "Cadenas o nada.", "Esto cuaja seguro.", "Mañana habrá hielo.", "Qué bonito, pero qué engorro."], wind: ["Sujeta bien el toldo.", "Se va a volar la antena.", "Cuidado al abrir la puerta del coche.", "Esto seca la ropa rápido.", "Vaya ventolera.", "Revisa las tejas."], cloudy: ["Buen día para lavar el coche, no se seca rápido.", "Ni frío ni calor.", "Está el cielo feo.", "A ver si escampa.", "Día gris.", "Aprovecha para podar.", "No hace falta regar."], nice: ["Día perfecto para lavar el coche.", "Vamos a dar una vuelta al campo.", "Apaga las luces, hay luz natural.", "Ni una nube.", "Así da gusto.", "Buen día para cortar el césped."], allergy: ["Eso no es nada, es psicológico.", "Anda, toma un pañuelo.", "Estornudas muy fuerte.", "A mí el polen no me hace nada.", "Sal al aire libre, te despejará."] } },
    novia:      { icon: "👩‍❤️‍💋‍👨", name: "Novia",     tips: { hot: ["Vamos a la playa, porfi.", "Hace demasiado calor para abrazarnos.", "¿Me compras un helado?", "Ponte guapo pero fresco.", "Quiero ir a una terraza.", "Mis pelos con esta humedad...", "Llévame a ver el atardecer."], cold: ["Tengo las manos heladas, caliéntamelas.", "Dame tu sudadera, tengo frío.", "Día de peli y manta.", "No siento los pies.", "Abrázame fuerte.", "Quiero un chocolate caliente.", "No salgamos, hace frío."], rain: ["Se me va a encrespar el pelo.", "Plan romántico en casa.", "Qué lluvia más triste... abrázame.", "Recógeme en coche.", "Día de spa en casa.", "Parece una peli romántica.", "No me quiero mojar."], snow: ["¡Qué romántico! Hazme una foto.", "Vamos a hacer un muñeco de nieve.", "Tengo frío, caliéntame.", "Todo está precioso.", "Quiero ir a esquiar contigo.", "Parece de cuento.", "Dame tu abrigo."], wind: ["Se me enreda el pelo, qué horror.", "No puedo llevar falda hoy.", "Vámonos, qué viento más molesto.", "Sujétame que me vuelo.", "Mis labios se cortan.", "Qué tiempo más loco.", "No me gusta el viento."], cloudy: ["Qué día más tonto.", "Vamos de compras.", "No hay buena luz para fotos.", "Me aburro, entretenme.", "Día de mimos.", "Está feo fuera, quedémonos dentro.", "No sé qué ponerme."], nice: ["¿Hacemos un picnic?", "Sácame una foto con este sol.", "Vamos a pasear de la mano.", "Estás muy guapo hoy.", "Qué día más bonito, como tú.", "Vamos de compras.", "Día de cita."], allergy: ["Tengo la nariz roja, no me mires.", "Tráeme pañuelos, porfi.", "Me pican los ojos.", "Cierra la ventana, que me pongo mala.", "¿Me cuidas?"] } }
};

// ============================================================
// 3. ESTADO GLOBAL
// ============================================================
let currentId         = localStorage.getItem('lastId') || 'Madrid';
const hadStoredCity   = !!localStorage.getItem('lastId'); // true si ya se había abierto la app antes
let currentCityName   = localStorage.getItem('lastName') || 'Madrid';
let currentCityRegion = localStorage.getItem('lastRegion') || '';
let currentCityInfo   = { id: currentId, name: currentCityName, region: currentCityRegion, lat: null, lon: null };
let favorites         = JSON.parse(localStorage.getItem('aeris_favs')) || [];
let tempChartInstance = null;
let lastWeatherData   = null;
let currentPersona    = localStorage.getItem('aeris_persona') || 'normal';
let useFahrenheit     = localStorage.getItem('aeris_units') === 'F';
let weatherAnimFrame  = null;
let weatherParticles  = [];
let currentWeatherType = 'clear';
let lastHero          = {};   // para animar cada pieza del hero solo cuando cambia de verdad
let lastRenderedPlace = null; // para animar los datos solo al cambiar de sitio, no en cada refresco

// Reescribe el HTML solo si cambia. Así lo que tiene animación de entrada
// (alertas, barras) no se vuelve a animar en cada refresco sin novedades.
const setHTMLIfChanged = (el, html) => {
    if (el._html === html) return false;
    el._html = html;
    el.innerHTML = html;
    return true;
};

// El splash se ve al menos 3 s desde que se abre la app (mientras, los datos
// se pintan por detrás) y se va en cuanto hay datos, o tras un máximo.
const SPLASH_MIN_MS = 3000;
let splashHidden = false;
let splashTimer = null;
function hideSplash() {
    if (splashHidden) return;
    const wait = SPLASH_MIN_MS - performance.now();
    if (wait > 0) {
        if (!splashTimer) splashTimer = setTimeout(() => { splashTimer = null; hideSplash(); }, wait);
        return;
    }
    splashHidden = true;
    const splash = document.getElementById('splash-screen');
    if (splash) {
        splash.classList.add('hidden');
        // Fuera del árbol de render al terminar el fundido: su animación de carga deja de correr
        setTimeout(() => { splash.style.display = 'none'; }, 500);
    }
    document.body.classList.add('is-ready');
    syncThemeColor();
    setTimeout(initOnboarding, 500);
}

window.retryWeather = () => {
    document.getElementById('error-banner').style.display = 'none';
    getWeather(currentId);
};

// ============================================================
// 4. UNIDADES (°C/°F, km/h/mph)
// ============================================================
const toF = (c) => Math.round(c * 9/5 + 32);
const toMph = (k) => Math.round(k * 0.621371);
const fmtTemp = (c) => useFahrenheit ? toF(c) : c;
const fmtWind = (k) => useFahrenheit ? toMph(k) : k;
const windUnit = () => useFahrenheit ? 'mph' : 'km/h';
const tempUnit = () => useFahrenheit ? '°F' : '°C';

const updateUnitsUI = () => {
    const label = document.getElementById('units-label');
    if (label) label.textContent = useFahrenheit ? '°F' : '°C';
    document.querySelectorAll('.unit-temp').forEach(el => el.textContent = useFahrenheit ? '°F' : '°');
    document.querySelectorAll('.unit-wind').forEach(el => el.textContent = windUnit());
};

const unitsBtn = document.getElementById('unitsBtn');
if (unitsBtn) {
    unitsBtn.addEventListener('click', () => {
        useFahrenheit = !useFahrenheit;
        localStorage.setItem('aeris_units', useFahrenheit ? 'F' : 'C');
        updateUnitsUI();
        if (lastWeatherData) renderWeather(window._lastFullData);
    });
}

// ============================================================
// 5. HISTORIAL DE BÚSQUEDAS
// ============================================================
const addToHistory = (city) => {
    let history = JSON.parse(localStorage.getItem('aeris_history') || '[]');
    history = history.filter(c => String(c.id) !== String(city.id));
    history.unshift({ id: city.id, name: city.name, region: city.region || '', lat: city.lat || null, lon: city.lon || null });
    history = history.slice(0, 5);
    localStorage.setItem('aeris_history', JSON.stringify(history));
};

const showSearchHistory = () => {
    const history = JSON.parse(localStorage.getItem('aeris_history') || '[]');
    if (history.length === 0) return;
    const sl = document.getElementById('suggestions');
    sl.innerHTML = '<li class="history-header text-uppercase fw-bold">Recientes</li>';
    history.forEach(c => {
        const li = document.createElement('li');
        li.className = 'suggestion-item';
        li.innerHTML = '<span><i class="bi bi-clock-history me-2 opacity-50" style="font-size:0.8rem"></i></span><small></small>';
        li.querySelector('span').append(c.name);
        li.querySelector('small').textContent = c.region;
        li.addEventListener('click', () => selectCity(c));
        sl.appendChild(li);
    });
    sl.classList.add('show');
};

// (Micrófono eliminado — búsqueda por texto)

// ============================================================
// 7. URL COMPARTIBLE (?ciudad=nombre o ?lat=,lon=)
// ============================================================
let cameFromSharedLink = false;
let pendingSection = null;
(function handleURLParams() {
    const params = new URLSearchParams(window.location.search);
    const ciudad = params.get('ciudad');
    const lat    = params.get('lat');
    const lon    = params.get('lon');
    if (ciudad) {
        currentId = ciudad;
        localStorage.setItem('lastId', ciudad);
        cameFromSharedLink = true;
    } else if (lat && lon) {
        currentId = `${lat},${lon}`;
        localStorage.setItem('lastId', currentId);
        const name = params.get('name');
        if (name) { localStorage.setItem('lastName', name); localStorage.setItem('lastRegion', ''); }
        cameFromSharedLink = true;
    }
    // ?ver=lluvia|avisos: al abrir desde una notificación, ir a esa sección
    pendingSection = params.get('ver');
})();
// Al abrir la app se quita el globo del icono (avisos ya vistos)
try { navigator.clearAppBadge && navigator.clearAppBadge().catch(() => {}); } catch (e) {}

// ============================================================
// 8. UTILIDADES
// ============================================================
const renderIcon = (iconName, size = "fs-4") => {
    if (iconName.includes('bi-cloud-sun') && !iconName.includes('moon')) {
        const big = size.includes("5.5rem") || size.includes("fs-1");
        return `<img src="icono-clima.png" alt="Sol y Nube" style="width:${big ? '160px' : '48px'};height:auto;vertical-align:middle;">`;
    }
    return `<i class="bi ${iconName} ${size}"></i>`;
};

// Fundido con desenfoque al cambiar un dato visible (ciudad, unidades).
// El blur "funde" el estado viejo y el nuevo para que no se vean dos cosas.
const blurIn = (el) => {
    if (!el || !el.animate) return;
    const reduce = prefersReducedMotion();
    el.animate(
        reduce
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [{ opacity: 0, filter: 'blur(4px)', transform: 'translateY(4px)' }, { opacity: 1, filter: 'blur(0)', transform: 'none' }],
        { duration: reduce ? 150 : 280, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
    );
};

// Color absoluto para una temperatura (barras de rango de la semana)
const TEMP_STOPS = [[-5, [139, 180, 255]], [5, [110, 210, 250]], [13, [110, 231, 183]], [19, [190, 235, 90]], [24, [250, 204, 21]], [30, [251, 146, 60]], [36, [244, 63, 94]]];
const tempColor = (t) => {
    if (t <= TEMP_STOPS[0][0]) return `rgb(${TEMP_STOPS[0][1]})`;
    for (let i = 1; i < TEMP_STOPS.length; i++) {
        const [t1, c1] = TEMP_STOPS[i];
        if (t <= t1) {
            const [t0, c0] = TEMP_STOPS[i - 1];
            const k = (t - t0) / (t1 - t0);
            return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * k)).join(',')})`;
        }
    }
    return `rgb(${TEMP_STOPS[TEMP_STOPS.length - 1][1]})`;
};

const normalizeInput = (str) => str.normalize("NFD").replace(/[̀-ͯ]/g, "");

// Escapa texto antes de insertarlo como HTML (nombres de ciudad/región vienen
// de APIs externas o de lo que el usuario ha guardado — no deberían poder
// inyectar HTML/atributos al pintarse en la interfaz).
const escapeHTML = (str) => String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));

// ============================================================
// CARGA DIFERIDA DE LIBRERÍAS PESADAS (Chart.js / html2canvas)
// Solo se descargan la primera vez que hacen falta de verdad
// (un gráfico o el botón de compartir), no en el arranque.
// ============================================================
const _scriptLoadCache = {};
function loadScriptOnce(src) {
    if (_scriptLoadCache[src]) return _scriptLoadCache[src];
    _scriptLoadCache[src] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('No se pudo cargar ' + src));
        document.head.appendChild(s);
    });
    return _scriptLoadCache[src];
}
const ensureChartJS = () => (typeof Chart !== 'undefined')
    ? Promise.resolve()
    : loadScriptOnce('https://cdn.jsdelivr.net/npm/chart.js');
const ensureHtml2Canvas = () => (typeof html2canvas !== 'undefined')
    ? Promise.resolve()
    : loadScriptOnce('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');

const BG_CLASSES = ['bg-hot', 'bg-rain', 'bg-snow', 'bg-cloudy-day', 'bg-cloudy-night', 'bg-clear-day', 'bg-clear-night'];

// La barra de estado / chrome del navegador toma el color del cielo actual
// (mientras se ve el splash, el azul de la marca, como el propio splash)
const SPLASH_COLOR = '#1554c0';
const syncThemeColor = () => {
    const color = getComputedStyle(document.body).getPropertyValue('--theme').trim();
    if (!color) return;
    const meta = document.getElementById('meta-theme-color');
    if (meta) meta.setAttribute('content', splashHidden ? color : SPLASH_COLOR);
    document.documentElement.style.backgroundColor = color;
    try { localStorage.setItem('aeris_theme_color', color); } catch (e) {}
};

const getBgClass = (cur) => {
    const code = cur.desc.toLowerCase(), temp = cur.temp;
    if (temp > 35) return 'bg-hot';
    if (code.includes('lluvia') || code.includes('llovizna') || code.includes('tormenta') || code.includes('chubascos')) return 'bg-rain';
    if (code.includes('nieve')) return 'bg-snow';
    if (code.includes('nublado') || code.includes('nubes') || code.includes('cubierto') || code.includes('niebla')) return cur.isDay ? 'bg-cloudy-day' : 'bg-cloudy-night';
    return cur.isDay ? 'bg-clear-day' : 'bg-clear-night';
};

const setDynamicBackground = (cur) => {
    // Solo tocamos las clases de cielo: is-ready / is-scrolled deben sobrevivir
    document.body.classList.remove(...BG_CLASSES);
    document.body.classList.add(getBgClass(cur));
    syncThemeColor();
};

// ============================================================
// 9. ANIMACIONES DE CLIMA (Canvas)
// ============================================================
const canvas = document.getElementById('weather-canvas');
const ctx2d  = canvas ? canvas.getContext('2d') : null;
// Gama baja: menos partículas y ~30 fps. Va debajo de muchas capas con
// backdrop-filter, y cada frame del canvas obliga a volver a desenfocarlas.
const LOW_END = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
let canvasW = 0, canvasH = 0, canvasDpr = 0;

// A la resolución real de la pantalla (si no, en el iPhone se ve borroso).
// Solo se redimensiona si cambia el ancho: la barra de URL del móvil cambia
// la altura al hacer scroll y no queremos rehacer el lienzo a cada momento.
function resizeCanvas() {
    if (!canvas) return;
    const w = canvas.clientWidth || window.innerWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === canvasW && dpr === canvasDpr) return;
    canvasW = w; canvasDpr = dpr;
    canvasH = Math.max(window.innerHeight, screen.height || 0);
    canvas.style.height = canvasH + 'px'; // más alto que la pantalla: no hay hueco al esconderse la barra de URL
    canvas.width  = Math.round(canvasW * dpr);
    canvas.height = Math.round(canvasH * dpr);
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// La lluvia va en 3 niveles de opacidad: así se traza un path por nivel
// (3 stroke por frame) en vez de uno por gota
const RAIN_ALPHAS = [0.2, 0.3, 0.4];
function createParticles(type) {
    weatherParticles = [];
    const count = type === 'rain' ? (LOW_END ? 60 : 100) : type === 'snow' ? (LOW_END ? 30 : 60) : 0;
    for (let i = 0; i < count; i++) {
        if (type === 'rain') {
            weatherParticles.push({ x: Math.random() * canvasW, y: Math.random() * canvasH - canvasH, speed: 8 + Math.random() * 6, len: 15 + Math.random() * 20, layer: i % RAIN_ALPHAS.length });
        } else if (type === 'snow') {
            weatherParticles.push({ x: Math.random() * canvasW, y: Math.random() * canvasH, speed: 0.5 + Math.random() * 1, r: 2 + Math.random() * 4, opacity: 0.4 + Math.random() * 0.5, phase: Math.random() * Math.PI * 2 });
        }
    }
}

// Con delta-time: la lluvia cae igual de rápido a 30, 60 o 120 Hz
let lastFrameT = 0;
function animateWeather(now) {
    if (!ctx2d || !canvas) return;
    weatherAnimFrame = requestAnimationFrame(animateWeather);
    if (!lastFrameT) lastFrameT = now;
    const elapsed = now - lastFrameT;
    if (LOW_END && elapsed < 32) return;
    const k = Math.min(elapsed, 50) / 16.667; // normalizado a 60 fps, con tope tras una pausa
    lastFrameT = now;
    ctx2d.clearRect(0, 0, canvasW, canvasH);

    if (currentWeatherType === 'rain') {
        ctx2d.strokeStyle = 'rgb(147,197,253)';
        ctx2d.lineWidth = 1;
        RAIN_ALPHAS.forEach((alpha, layer) => {
            ctx2d.globalAlpha = alpha;
            ctx2d.beginPath();
            weatherParticles.forEach(p => {
                if (p.layer !== layer) return;
                p.y += p.speed * k; p.x -= p.speed * 0.1 * k;
                if (p.y > canvasH) { p.y = -p.len; p.x = Math.random() * canvasW; }
                ctx2d.moveTo(p.x, p.y); ctx2d.lineTo(p.x - 1, p.y + p.len);
            });
            ctx2d.stroke();
        });
    } else if (currentWeatherType === 'snow') {
        const t = now * 0.001;
        ctx2d.fillStyle = 'white';
        weatherParticles.forEach(p => {
            p.y += p.speed * k; p.x += Math.sin(t + p.phase) * 0.5 * k;
            if (p.y > canvasH) { p.y = -5; p.x = Math.random() * canvasW; }
            ctx2d.globalAlpha = p.opacity;
            ctx2d.beginPath(); ctx2d.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx2d.fill();
        });
    }
    ctx2d.globalAlpha = 1;
}

const prefersReducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function startWeatherAnimation(type) {
    // Respetamos la preferencia de "reducir movimiento" del sistema: no
    // arrancamos las partículas de lluvia/nieve/sol en canvas para quien
    // tenga esa opción activada (mareos, migrañas, sensibilidad al movimiento).
    if (prefersReducedMotion()) type = 'none';
    currentWeatherType = type;
    if (weatherAnimFrame) cancelAnimationFrame(weatherAnimFrame);
    if (type === 'none') { if (ctx2d) ctx2d.clearRect(0, 0, canvasW, canvasH); return; }
    createParticles(type);
    lastFrameT = 0;
    weatherAnimFrame = requestAnimationFrame(animateWeather);
}

function getAnimationType(desc, isDay) {
    const d = desc.toLowerCase();
    if (d.includes('lluvia') || d.includes('llovizna') || d.includes('tormenta') || d.includes('chubasco')) return 'rain';
    if (d.includes('nieve') || d.includes('granizo') || d.includes('aguanieve')) return 'snow';
    return 'none';
}

// ============================================================
// 10. RELOJ SOLAR
// ============================================================
// Minutos desde medianoche en la zona horaria de la ciudad
function cityNowMinutes(tz) {
    const key = tz ? localNowKey(tz) : null; // "YYYY-MM-DDTHH:mm"
    if (key) { const [h, m] = key.slice(11, 16).split(':').map(Number); return h * 60 + m; }
    const d = new Date(); return d.getHours() * 60 + d.getMinutes();
}

function renderSolarClock(sunrise, sunset, timezone) {
    const solarCard = document.getElementById('solar-card');
    const sCanvas   = document.getElementById('solar-clock-canvas');
    if (!sCanvas || !sunrise || !sunset) { if (solarCard) solarCard.style.display = 'none'; return; }
    solarCard.style.display = 'block';

    document.getElementById('sunrise-time').textContent = sunrise;
    document.getElementById('sunset-time').textContent  = sunset;

    const [srH, srM] = sunrise.split(':').map(Number);
    const [ssH, ssM] = sunset.split(':').map(Number);
    const srMin  = srH * 60 + srM;
    const ssMin  = ssH * 60 + ssM;
    const nowMin = cityNowMinutes(timezone);

    const total = ssMin - srMin;
    const elapsed = Math.max(0, Math.min(nowMin - srMin, total));
    const pct = total > 0 ? elapsed / total : 0;

    const pctEl = document.getElementById('solar-pct');
    if (pctEl) pctEl.textContent = nowMin < srMin ? 'Antes del amanecer' :
        nowMin > ssMin ? 'Sol bajo el horizonte' : `${Math.round(pct * 100)}% del día transcurrido`;

    // Dibujar después de que el DOM actualice las dimensiones
    requestAnimationFrame(() => {
        const W = sCanvas.offsetWidth || sCanvas.parentElement?.offsetWidth || 300;
        if (W < 10) return; // card aún no tiene dimensiones
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        sCanvas.width  = Math.round(W * dpr);
        sCanvas.height = 80 * dpr;
        sCanvas.style.height = '80px';
        const sCtx = sCanvas.getContext('2d');
        sCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const H = 80, pad = 20;

        sCtx.clearRect(0, 0, W, H);

        const cx = W / 2, cy = H + 8, rx = (W - pad * 2) / 2, ry = H - 10;
        const startAngle = Math.PI, endAngle = 0;

        // Arco fondo
        sCtx.lineCap = 'round';
        sCtx.beginPath();
        sCtx.ellipse(cx, cy, rx, ry, 0, startAngle, endAngle);
        sCtx.strokeStyle = 'rgba(255,255,255,0.16)';
        sCtx.lineWidth = 4;
        sCtx.stroke();

        // Arco iluminado
        const progressAngle = Math.PI + pct * Math.PI;
        const grad = sCtx.createLinearGradient(pad, 0, W - pad, 0);
        grad.addColorStop(0, '#f97316');
        grad.addColorStop(0.5, '#facc15');
        grad.addColorStop(1, '#f97316');
        sCtx.beginPath();
        sCtx.ellipse(cx, cy, rx, ry, 0, startAngle, progressAngle);
        sCtx.strokeStyle = grad;
        sCtx.lineWidth = 4;
        sCtx.stroke();

        // Disco solar con halo
        const sunX = cx + rx * Math.cos(Math.PI + pct * Math.PI);
        const sunY = cy + ry * Math.sin(Math.PI + pct * Math.PI);
        const sunR = 10;
        const sunGrad = sCtx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 2.5);
        sunGrad.addColorStop(0, 'rgba(254,249,195,1)');
        sunGrad.addColorStop(0.4, 'rgba(251,191,36,0.9)');
        sunGrad.addColorStop(1, 'rgba(251,191,36,0)');
        sCtx.beginPath();
        sCtx.arc(sunX, sunY, sunR * 2.5, 0, Math.PI * 2);
        sCtx.fillStyle = sunGrad;
        sCtx.fill();
        sCtx.beginPath();
        sCtx.arc(sunX, sunY, sunR * 0.7, 0, Math.PI * 2);
        sCtx.fillStyle = '#fef08a';
        sCtx.fill();
    });
}

// ============================================================
// 11. FASE LUNAR
// ============================================================
// SunCalc (vendor/suncalc.js) da la fase y la iluminación reales y la
// salida/puesta de la luna para ese sitio; antes era un emoji con un ciclo medio.
const MOON_NAMES = ['Luna nueva', 'Creciente', 'Cuarto creciente', 'Gibosa creciente', 'Luna llena', 'Gibosa menguante', 'Cuarto menguante', 'Menguante'];
const moonName = (phase) => MOON_NAMES[Math.round(phase * 8) % 8];

// Dibujo de la fase: disco oscuro + parte iluminada (dos arcos)
function moonSVG(phase, size = 22) {
    const r = size / 2 - 1, c = size / 2;
    const lit = Math.cos(phase * 2 * Math.PI);           // 1 nueva, -1 llena
    const rx = Math.abs(lit) * r;
    const waxing = phase < 0.5;
    // Borde exterior iluminado: derecha si crece, izquierda si mengua
    const outer = `M ${c} ${c - r} A ${r} ${r} 0 0 ${waxing ? 1 : 0} ${c} ${c + r}`;
    const inner = `A ${rx} ${r} 0 0 ${(lit > 0) === waxing ? 0 : 1} ${c} ${c - r}`;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">`
        + `<circle cx="${c}" cy="${c}" r="${r}" fill="rgba(255,255,255,0.14)"/>`
        + `<path d="${outer} ${inner} Z" fill="#f4f1e6"/></svg>`;
}

function renderMoon(lat, lon, timezone) {
    const el = document.getElementById('lunar-display');
    if (!el || typeof SunCalc === 'undefined') return;
    const now = new Date();
    const ill = SunCalc.getMoonIllumination(now);
    const pct = Math.round(ill.fraction * 100);
    let times = '';
    if (Number.isFinite(+lat) && Number.isFinite(+lon)) {
        const t = SunCalc.getMoonTimes(now, +lat, +lon);
        const fmt = (d) => d ? new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone || undefined }).format(d) : null;
        const rise = fmt(t.rise), set = fmt(t.set);
        times = [rise && `sale ${rise}`, set && `se pone ${set}`].filter(Boolean).join(' · ');
    }
    el.innerHTML = `${moonSVG(ill.phase)}<span>${moonName(ill.phase)} · ${pct}%</span>`;
    el.title = times ? `${moonName(ill.phase)}, ${pct} % iluminada. ${times}` : `${moonName(ill.phase)}, ${pct} % iluminada`;
    const timesEl = document.getElementById('moon-times');
    if (timesEl) timesEl.textContent = times;
}

// ============================================================
// 12. HORA LOCAL
// ============================================================
let localTimeInterval = null;
function startLocalTime(timezone) {
    const el = document.getElementById('local-time');
    if (!el || !timezone) return;
    if (localTimeInterval) clearInterval(localTimeInterval);
    const update = () => {
        try {
            const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: timezone, hour12: false }).format(new Date());
            el.textContent = `${time} · hora local`;
            el.style.display = 'block';
        } catch { el.style.display = 'none'; }
    };
    update();
    localTimeInterval = setInterval(update, 15000);
}

// ============================================================
// 13. ÍNDICE DE CONFORT
// ============================================================
function calcComfort(temp, humidity, windSpeed, uv, desc) {
    let score = 100;
    // Temperatura ideal 18-24
    if (temp > 35) score -= 40;
    else if (temp > 28) score -= 15;
    else if (temp > 24) score -= 5;
    else if (temp < 5) score -= 40;
    else if (temp < 10) score -= 20;
    else if (temp < 15) score -= 8;
    // Humedad ideal 40-60%
    if (humidity > 80) score -= 15;
    else if (humidity > 70) score -= 8;
    else if (humidity < 20) score -= 10;
    // Viento
    if (windSpeed > 50) score -= 20;
    else if (windSpeed > 30) score -= 10;
    else if (windSpeed > 20) score -= 5;
    // UV
    if (uv > 10) score -= 10;
    else if (uv > 7) score -= 5;
    // Condiciones
    const d = desc.toLowerCase();
    if (d.includes('tormenta')) score -= 25;
    else if (d.includes('lluvia') || d.includes('nieve')) score -= 15;
    else if (d.includes('llovizna')) score -= 8;
    score = Math.max(0, Math.min(100, score));
    let label = 'Perfecto 😊', color = '#4ade80';
    if (score < 30) { label = 'Malo 😰'; color = '#ef4444'; }
    else if (score < 55) { label = 'Regular 😐'; color = '#facc15'; }
    else if (score < 75) { label = 'Bueno 🙂'; color = '#86efac'; }
    return { score, label, color };
}

function renderComfort(temp, humidity, windSpeed, uv, desc) {
    const row  = document.getElementById('comfort-row');
    const bar  = document.getElementById('comfort-bar');
    const scoreEl = document.getElementById('comfort-score');
    const labelEl = document.getElementById('comfort-label');
    if (!row) return;
    const { score, label, color } = calcComfort(temp, humidity, windSpeed, uv, desc);
    row.style.setProperty('display', 'flex', 'important');
    // clip-path en vez de width: no provoca layout y el degradado no se deforma
    setTimeout(() => { if (bar) bar.style.clipPath = `inset(0 ${100 - score}% 0 0 round 99px)`; }, 200);
    if (scoreEl) { scoreEl.textContent = score; scoreEl.style.color = color; }
    if (labelEl) labelEl.textContent = label;
}

// ============================================================
// 14. TENDENCIA DE PRESIÓN
// ============================================================
// diff = presión ahora menos la de hace 3 h (viene del servidor)
function updatePressureTrend(diff) {
    const trendEl = document.getElementById('pressure-trend');
    if (!trendEl) return;
    if (diff == null) { trendEl.textContent = ''; return; }
    if (diff > 1) { trendEl.textContent = '↑'; trendEl.className = 'ms-1 trend-up'; trendEl.title = 'Subiendo: puede mejorar'; }
    else if (diff < -1) { trendEl.textContent = '↓'; trendEl.className = 'ms-1 trend-down'; trendEl.title = 'Bajando: puede empeorar'; }
    else { trendEl.textContent = '→'; trendEl.className = 'ms-1 trend-stable'; trendEl.title = 'Estable'; }
}

// ============================================================
// 15. GRÁFICO TEMPERATURA 7 DÍAS
// ============================================================
let tempChart7Instance = null;
async function renderTempChart(daily, placeChanged = true) {
    const card = document.getElementById('temp-chart-card');
    if (!card || !daily || daily.length < 3) { if (card) card.style.display = 'none'; return; }
    card.style.display = 'block';
    const labels  = daily.map(d => { const dt = new Date(d.fecha.replace(/-/g, '/')); return dt.toLocaleDateString('es-ES', { weekday: 'short' }); });
    const maxTemps = daily.map(d => useFahrenheit ? toF(d.tempMax) : d.tempMax);
    const minTemps = daily.map(d => useFahrenheit ? toF(d.tempMin) : d.tempMin);
    const cCtx = document.getElementById('tempChart');
    if (!cCtx) return;
    await ensureChartJS();
    applyChartDefaults();
    // Ya existe: se actualiza. Con ciudad nueva los puntos se desplazan a sus
    // valores nuevos; en un refresco o al cambiar de unidades, sin animación.
    if (tempChart7Instance) {
        tempChart7Instance.data.labels = labels;
        tempChart7Instance.data.datasets[0].data = maxTemps;
        tempChart7Instance.data.datasets[1].data = minTemps;
        tempChart7Instance.options.animation.duration = prefersReducedMotion() ? 0 : 400;
        tempChart7Instance.update(placeChanged ? undefined : 'none');
        return;
    }
    tempChart7Instance = new Chart(cCtx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Máx', data: maxTemps, borderColor: '#ffb070', borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: '#ffb070', pointBorderWidth: 0, fill: false, tension: 0.4 },
                { label: 'Mín', data: minTemps, borderColor: '#8cc8ff', borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: '#8cc8ff', pointBorderWidth: 0, fill: false, tension: 0.4 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: true, align: 'end', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 6, boxHeight: 6, font: { size: 11, weight: '600' }, color: 'rgba(255,255,255,0.7)' } } },
            scales: {
                x: { grid: { display: false }, border: { display: false }, ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 11, weight: '500' } } },
                y: { grid: { color: 'rgba(255,255,255,0.08)' }, border: { display: false }, ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 11 }, maxTicksLimit: 5, callback: v => v + '°' } }
            },
            animation: { duration: prefersReducedMotion() ? 0 : 500, easing: 'easeOutQuart' }
        }
    });
}

// Tipografía y tooltip coherentes con la interfaz para todos los gráficos
let chartDefaultsApplied = false;
function applyChartDefaults() {
    if (chartDefaultsApplied || typeof Chart === 'undefined') return;
    chartDefaultsApplied = true;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = 'rgba(255,255,255,0.6)';
    const tt = Chart.defaults.plugins.tooltip;
    tt.backgroundColor = 'rgba(10,14,28,0.92)';
    tt.titleColor = '#fff';
    tt.bodyColor = 'rgba(255,255,255,0.85)';
    tt.borderColor = 'rgba(255,255,255,0.14)';
    tt.borderWidth = 1;
    tt.cornerRadius = 12;
    tt.padding = 10;
    tt.boxPadding = 4;
    tt.usePointStyle = true;
}

// ============================================================
// 16. SHARE CARD REDISEÑADA
// ============================================================
window.closeShareModal = () => {
    const m = document.getElementById('share-modal');
    if (m) m.classList.remove('show');
};
document.getElementById('share-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'share-modal') closeShareModal();
});

// Botón ocupado: se ve que está trabajando y no admite un segundo toque
const setBusy = (btn, busy) => {
    if (!btn) return;
    const icon = btn.querySelector('i');
    if (icon) {
        if (busy) { icon.dataset.icon = icon.className; icon.className = 'bi bi-arrow-repeat'; }
        else if (icon.dataset.icon) { icon.className = icon.dataset.icon; delete icon.dataset.icon; }
    }
    btn.classList.toggle('is-loading', busy);
    btn.disabled = busy;
    if (busy) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy');
};

// En el móvil se abre la hoja de compartir del sistema (Fotos, WhatsApp,
// Instagram...); si el navegador no puede compartir archivos, se descarga.
window.downloadShareCard = async (btn) => {
    const card = document.getElementById('share-card-render');
    if (!card || (btn && btn.disabled)) return;
    setBusy(btn, true);
    try {
        await ensureHtml2Canvas();
        const canvas = await html2canvas(card, { scale: 3, backgroundColor: null, useCORS: true });
        const blob = await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob')), 'image/png'));
        const file = new File([blob], `aeris-${(currentCityInfo.name || 'weather').toLowerCase()}.png`, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try { await navigator.share({ files: [file], title: 'El tiempo en AERIS' }); return; }
            catch (e) { if (e.name === 'AbortError') return; } // cancelado por el usuario: nada más
        }
        const link = document.createElement('a');
        link.download = file.name;
        link.href = URL.createObjectURL(blob);
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    } catch (e) {
        console.error(e);
        showToast('No se pudo generar la imagen. Inténtalo de nuevo.', 'warn');
    } finally {
        setBusy(btn, false);
    }
};

function openShareCard(data) {
    const modal = document.getElementById('share-modal');
    if (!modal) return;
    const cur = data.current, loc = data.location;
    document.getElementById('share-city-name').textContent = (loc.name || '').toUpperCase();
    document.getElementById('share-temp-big').textContent  = fmtTemp(cur.temp) + (useFahrenheit ? '°F' : '°');
    document.getElementById('share-desc').textContent      = cur.desc;
    document.getElementById('share-feels').textContent     = `💧 ${cur.humidity}%`;
    document.getElementById('share-wind').textContent      = `💨 ${fmtWind(cur.windSpeed)} ${windUnit()}`;
    document.getElementById('share-uv').textContent        = `☀️ UV: ${Math.round(cur.uvMax ?? cur.uv)}`;
    // Fondo dinámico según clima
    const bg = document.getElementById('share-bg');
    if (bg) {
        // Mismo cielo que la app, con un halo de luz arriba a la derecha
        const SHARE_SKIES = {
            'bg-clear-day':    ['rgba(255,210,140,0.5)', '#1554c0', '#2f7fe0', '#5ea6ec'],
            'bg-clear-night':  ['rgba(150,110,255,0.4)', '#070b1f', '#121a46', '#2a2370'],
            'bg-cloudy-day':   ['rgba(255,255,255,0.28)', '#3f5068', '#627790', '#8a9fb6'],
            'bg-cloudy-night': ['rgba(130,150,185,0.25)', '#0a0e15', '#18202d', '#2c3849'],
            'bg-rain':         ['rgba(90,150,230,0.35)', '#101824', '#1f2f45', '#3a4f6c'],
            'bg-snow':         ['rgba(255,255,255,0.4)', '#3f5f88', '#6584ab', '#92abc8'],
            'bg-hot':          ['rgba(255,220,120,0.55)', '#a8290a', '#d9520e', '#ee8b25']
        };
        const [glow, c1, c2, c3] = SHARE_SKIES[getBgClass(cur)];
        bg.style.background = `radial-gradient(120% 80% at 90% 0%, ${glow}, transparent 55%), linear-gradient(165deg, ${c1}, ${c2} 55%, ${c3})`;
    }
    modal.classList.add('show');
}

// ============================================================
// 17. AI TIPS E OUTFIT
// ============================================================
const updateAIText = (cur, highPollen = false) => {
    if (!cur) return;
    const p = aiLogic[currentPersona];
    document.getElementById('tip-icon').innerText = p.icon;
    let key = 'nice';
    const d = cur.desc.toLowerCase(), t = cur.temp, w = cur.windSpeed;
    if (highPollen) key = 'allergy';
    else if (d.includes('nieve') || d.includes('nevada') || d.includes('granizo') || d.includes('aguanieve')) key = 'snow';
    else if (d.includes('tormenta') || d.includes('trueno') || d.includes('lluvia') || d.includes('llovizna') || d.includes('chubasco')) key = 'rain';
    else if (w > 25) key = 'wind';
    else if (t > 28) key = 'hot';
    else if (t < 12) key = 'cold';
    else if (d.includes('nublado') || d.includes('cubierto') || d.includes('nubes') || d.includes('niebla')) key = 'cloudy';
    const frases = p.tips[key] || p.tips['nice'];
    document.getElementById('tip-text').innerText = frases[Math.floor(Math.random() * frases.length)];
    // Para la ropa cuenta el UV máximo del día, no el de este momento
    const clothes = getClothingList(cur.temp, cur.desc, cur.windSpeed, Math.round(cur.uvMax ?? cur.uv));
    const clothingContainer = document.getElementById('clothing-advice');
    if (clothingContainer) {
        // Solo texto: un icono que no representa la prenda solo añade ruido
        const tag = (i, kind) => `<span class="clothing-tag ${kind}">${i.text}</span>`;
        let html =
            `<div class="outfit-group"><span class="outfit-group-label">Ellos</span><div class="outfit-tags">${clothes.boys.map(i => tag(i, 'boy')).join('')}</div></div>` +
            `<div class="outfit-group"><span class="outfit-group-label">Ellas</span><div class="outfit-tags">${clothes.girls.map(i => tag(i, 'girl')).join('')}</div></div>`;
        if (clothes.tip) html += `<div class="outfit-tip"><i class="bi ${clothes.tip.icon}" aria-hidden="true"></i><span>${clothes.tip.text}</span></div>`;
        clothingContainer.innerHTML = html;
    }
};

const getClothingList = (temp, desc, wind, uv) => {
    const item = (text) => ({ text });
    let boys = [], girls = [], tip = null;
    desc = desc.toLowerCase();
    const isRain = desc.includes('lluvia') || desc.includes('llovizna') || desc.includes('tormenta');
    const isSnow = desc.includes('nieve') || desc.includes('nevada');
    const isClear = desc.includes('despejado') || desc.includes('sol');
    if (temp >= 30)      { boys.push(item('Tirantes')); girls.push(item('Top/Vestido')); boys.push(item('Shorts')); girls.push(item('Shorts')); boys.push(item('Abanico')); girls.push(item('Abanico')); }
    else if (temp >= 25) { boys.push(item('Camiseta')); girls.push(item('Blusa')); boys.push(item('Chino corto')); girls.push(item('Falda')); }
    else if (temp >= 20) { boys.push(item('Polo')); girls.push(item('Camiseta')); boys.push(item('Jeans')); girls.push(item('Culotte')); }
    else if (temp >= 15) { boys.push(item('Camisa')); girls.push(item('Cardigan')); boys.push(item('Chinos')); girls.push(item('Jeans')); boys.push(item('Chaleco')); girls.push(item('Blazer')); }
    else if (temp >= 10) { boys.push(item('Sudadera')); girls.push(item('Jersey')); boys.push(item('Cazadora')); girls.push(item('Trench')); }
    else if (temp >= 5)  { boys.push(item('Jersey Lana')); girls.push(item('Jersey Grueso')); boys.push(item('Abrigo')); girls.push(item('Abrigo')); }
    else                 { boys.push(item('Térmica')); girls.push(item('Térmica')); boys.push(item('Plumífero')); girls.push(item('Plumífero')); }
    if (temp < 10 || (wind > 20 && temp < 15)) { boys.push(item('Bufanda')); girls.push(item('Bufanda')); }
    if (temp < 5)  { boys.push(item('Gorro')); girls.push(item('Gorro')); }
    if (isRain)    { boys.push(item('Paraguas')); girls.push(item('Paraguas')); boys.push(item('Impermeable')); girls.push(item('Gabardina')); if (temp < 15) { boys.push(item('Botas Agua')); girls.push(item('Botas Agua')); } }
    if (isSnow)    { boys.push(item('Botas Nieve')); girls.push(item('Botas Nieve')); boys.push(item('Guantes')); girls.push(item('Guantes')); }
    if (uv > 5 && isClear) { boys.push(item('Gafas Sol')); girls.push(item('Gafas Sol')); boys.push(item('Gorra')); girls.push(item('Sombrero')); }
    // Un consejo práctico según el tiempo (sin enlaces: la app no es comercial)
    if (isRain && wind > 25) tip = { text: 'Viento y lluvia: mejor un paraguas antiviento o chubasquero', icon: 'bi-umbrella-fill' };
    else if (isRain)    tip = { text: 'Lleva paraguas: hoy toca mojarse', icon: 'bi-umbrella-fill' };
    else if (isSnow)    tip = { text: 'Si vas a conducir, lleva cadenas en el coche', icon: 'bi-snow2' };
    else if (uv > 7)    tip = { text: `UV muy alto (${uv}): crema solar 50+ y gafas`, icon: 'bi-sun-fill' };
    else if (temp > 32) tip = { text: 'Calor fuerte: ropa clara, agua y sombra', icon: 'bi-thermometer-sun' };
    else if (temp < 4)  tip = { text: 'Frío intenso: abrígate por capas y protege manos y orejas', icon: 'bi-thermometer-snow' };
    return { boys: boys.slice(0, 5), girls: girls.slice(0, 5), tip };
};

// ============================================================
// 18. PERSONA MODAL
// ============================================================
const modal = document.getElementById('personaModal');
const personaGrid = document.getElementById('personaGrid');

const personaSheet = document.getElementById('personaSheet');
const closePersonaModal = () => {
    modal.classList.remove('show');
    if (personaSheet) { personaSheet.style.transform = ''; personaSheet.style.transition = ''; }
};

const openPersonaModal = () => {
    personaGrid.innerHTML = '';
    Object.keys(aiLogic).forEach((key, i) => {
        const p = aiLogic[key];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `persona-option ${key === currentPersona ? 'active' : ''}`;
        btn.style.setProperty('--i', i);
        btn.setAttribute('aria-pressed', key === currentPersona);
        btn.onclick = () => {
            currentPersona = key;
            localStorage.setItem('aeris_persona', key);
            if (navigator.vibrate) navigator.vibrate(8);
            closePersonaModal();
            if (lastWeatherData) { updateAIText(lastWeatherData); blurIn(document.getElementById('ai-toggle')); }
        };
        btn.innerHTML = `<span class="persona-icon">${p.icon}</span><span class="persona-name">${p.name}</span>`;
        personaGrid.appendChild(btn);
    });
    modal.classList.add('show');
};
document.getElementById('ai-toggle').addEventListener('click', openPersonaModal);
document.getElementById('closePersonaModal').addEventListener('click', closePersonaModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closePersonaModal(); });

// Arrastrar hacia abajo para cerrar un sheet (solo en móvil, donde es un sheet).
// El sheet sigue al dedo 1:1, con resistencia hacia arriba; se cierra si se
// arrastra lo bastante o con un gesto rápido.
function initSheetDrag(zone, sheet, onClose) {
    if (!zone || !sheet) return;
    const isSheet = () => !window.matchMedia('(min-width: 640px)').matches;
    let startY = 0, startT = 0, dy = 0, dragging = false, pointerId = null;

    zone.addEventListener('pointerdown', (e) => {
        if (!isSheet() || dragging || e.target.closest('button')) return;
        dragging = true; pointerId = e.pointerId;
        startY = e.clientY; startT = performance.now(); dy = 0;
        zone.setPointerCapture(e.pointerId);
        sheet.style.transition = 'none';
    });
    zone.addEventListener('pointermove', (e) => {
        if (!dragging || e.pointerId !== pointerId) return;
        const raw = e.clientY - startY;
        dy = raw >= 0 ? raw : -Math.pow(-raw, 0.6); // resistencia hacia arriba
        sheet.style.transform = `translateY(${dy}px)`;
    });
    const end = (e) => {
        if (!dragging || e.pointerId !== pointerId) return;
        dragging = false;
        const velocity = dy / Math.max(1, performance.now() - startT);
        sheet.style.transition = '';
        if (dy > 120 || velocity > 0.11) onClose();
        else sheet.style.transform = '';
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
}
initSheetDrag(document.getElementById('personaDragZone'), personaSheet, closePersonaModal);
initSheetDrag(document.getElementById('iosDragZone'), document.getElementById('iosSheet'), () => window.closeIosModal());

// ============================================================
// 19. TEMA (automático por hora de sol — sin botón manual)
// ============================================================
const applyTheme = (theme) => {
    document.body.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-bs-theme', theme);
    document.documentElement.style.setProperty('--invert-close', theme === 'dark' ? '1' : '0');
    // Guardamos el tema calculado para que el script anti-flash del <head>
    // pueda aplicarlo de inmediato en la siguiente carga, antes de tener
    // datos frescos de la API (evita el parpadeo claro->oscuro por la noche).
    try { localStorage.setItem('aeris_theme_pref', theme); } catch (e) {}
};

function autoThemeByTime(sunrise, sunset, timezone) {
    if (!sunrise || !sunset) return;
    const [srH, srM] = sunrise.split(':').map(Number);
    const [ssH, ssM] = sunset.split(':').map(Number);
    const nowMin = cityNowMinutes(timezone);
    const srMin  = srH * 60 + srM;
    const ssMin  = ssH * 60 + ssM;
    const isDaytime = nowMin >= srMin && nowMin <= ssMin;
    applyTheme(isDaytime ? 'light' : 'dark');
}

// ============================================================
// 20. FAVORITOS
// ============================================================
const updateHeartUI = () => {
    const heart = document.getElementById('favHeart');
    if (!heart) return;
    const exists = favorites.some(f => String(f.id) === String(currentCityInfo.id));
    heart.classList.toggle('is-active', exists);
    heart.setAttribute('aria-pressed', exists);
    heart.setAttribute('aria-label', exists ? 'Quitar de favoritos' : 'Añadir a favoritos');
    const icon = heart.querySelector('i');
    if (icon) icon.className = exists ? 'bi bi-heart-fill' : 'bi bi-heart';
};
const toggleFavorite = () => {
    const index = favorites.findIndex(f => String(f.id) === String(currentCityInfo.id));
    const adding = index === -1;
    if (index > -1) favorites.splice(index, 1); else favorites.push({ ...currentCityInfo });
    localStorage.setItem('aeris_favs', JSON.stringify(favorites));
    updateHeartUI(); renderFavorites();
    // Feedback de "guardado": un pequeño latido, solo al añadir
    const icon = document.querySelector('#favHeart i');
    if (adding && icon && icon.animate && !prefersReducedMotion()) {
        icon.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }],
            { duration: 380, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    }
    if (navigator.vibrate) navigator.vibrate(adding ? 12 : 6);
};
const renderFavorites = () => {
    const list = document.getElementById('favList');
    if (!list) return;
    list.innerHTML = '';
    favorites.forEach(city => {
        const li = document.createElement('li');
        li.className = 'fav-item';
        li.innerHTML = `<div class="fav-item-info" role="button" tabindex="0"><span class="fav-name">${escapeHTML(city.name)}</span><span class="fav-region">${escapeHTML(city.region)}</span></div><button type="button" class="fav-delete" aria-label="Eliminar ${escapeHTML(city.name)}"><i class="bi bi-trash3"></i></button>`;
        li.querySelector('.fav-item-info').onclick = () => { closeSidebar(); selectCity(city); };
        li.querySelector('.fav-delete').onclick = (e) => {
            e.stopPropagation();
            favorites = favorites.filter(f => String(f.id) !== String(city.id));
            localStorage.setItem('aeris_favs', JSON.stringify(favorites));
            renderFavorites(); updateHeartUI();
        };
        list.appendChild(li);
    });
};
const openSidebar  = () => { document.getElementById('favSidebar').classList.add('open'); document.getElementById('overlay').classList.add('show'); renderFavorites(); };
const closeSidebar = () => { document.getElementById('favSidebar').classList.remove('open'); document.getElementById('overlay').classList.remove('show'); };
document.getElementById('favMenuBtn').addEventListener('click', openSidebar);
document.getElementById('closeSidebar').addEventListener('click', closeSidebar);
document.getElementById('overlay').addEventListener('click', closeSidebar);
document.getElementById('favHeart').addEventListener('click', toggleFavorite);
document.getElementById('favList').addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('fav-item-info')) { e.preventDefault(); e.target.click(); }
});

// Escape cierra la capa que esté abierta (sin animación extra: es teclado)
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (modal.classList.contains('show')) closePersonaModal();
    else if (document.getElementById('iosInstallModal')?.classList.contains('show')) closeIosModal();
    else if (document.getElementById('notificationModal')?.classList.contains('show')) closeNotifModal();
    else if (document.getElementById('share-modal').classList.contains('show')) closeShareModal();
    else if (document.getElementById('favSidebar').classList.contains('open')) closeSidebar();
    else if (suggestionsList && suggestionsList.classList.contains('show')) suggestionsList.classList.remove('show');
});

// ============================================================
// 21. BÚSQUEDA CON HISTORIAL
// ============================================================
const searchInput = document.getElementById('citySearch');
const suggestionsList = document.getElementById('suggestions');
let searchTimeout;
if (searchInput) {
    searchInput.addEventListener('focus', () => { if (searchInput.value.length < 3) showSearchHistory(); });
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        if (e.target.value.length < 3) { showSearchHistory(); return; }
        searchTimeout = setTimeout(async () => {
            try {
                const res = await fetch(`/api/search/${encodeURIComponent(normalizeInput(e.target.value))}`);
                const cities = await res.json();
                suggestionsList.innerHTML = '';
                cities.forEach(c => {
                    const li = document.createElement('li');
                    li.className = 'suggestion-item';
                    li.innerHTML = `<span>${escapeHTML(c.name)}</span><small>${escapeHTML(c.region)}</small>`;
                    li.onclick = () => selectCity(c);
                    suggestionsList.appendChild(li);
                });
                cities.length ? suggestionsList.classList.add('show') : suggestionsList.classList.remove('show');
            } catch (e) { }
        }, 300);
    });
    // Enter elige la primera sugerencia visible
    searchInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const first = suggestionsList.querySelector('.suggestion-item');
        if (first && suggestionsList.classList.contains('show')) { e.preventDefault(); first.click(); searchInput.blur(); }
    });
    document.addEventListener('click', (e) => { if (!searchInput.contains(e.target) && !suggestionsList.contains(e.target)) suggestionsList.classList.remove('show'); });
}

const selectCity = (city) => {
    if (searchInput) searchInput.value = '';
    if (suggestionsList) suggestionsList.classList.remove('show');
    const id = city.id || city.name;
    localStorage.setItem('lastId', id);
    localStorage.setItem('lastName', city.name);
    localStorage.setItem('lastRegion', city.region || '');
    currentId = id;
    currentCityInfo = { id, name: city.name, region: city.region || '', lat: city.lat || null, lon: city.lon || null };
    addToHistory(currentCityInfo);
    // Actualizar URL
    const url = new URL(window.location);
    url.searchParams.set('ciudad', city.name);
    window.history.replaceState({}, '', url);
    document.querySelectorAll('#city, #desc, #temp, #tip-text').forEach(el => { el.classList.add('skeleton'); el.style.removeProperty('height'); });
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    getWeather(id);
};

// ============================================================
// 22. COMPARTIR (nuevo)
// ============================================================
document.getElementById('shareBtn').addEventListener('click', () => {
    if (window._lastFullData) openShareCard(window._lastFullData);
});

// ============================================================
// 23. LLUVIA INMINENTE (nowcast minuto a minuto)
// ============================================================
// Open-Meteo da la precipitación en tramos de 15 min; cada valor es lo que
// cae en los 15 min ANTERIORES a su hora (el tramo "10:45" cubre 10:30–10:45).
// Las horas vienen en hora local de la ciudad, así que comparamos contra la
// hora actual EN ESA ZONA, no la del dispositivo.
const NC_WET = 0.05;          // mm en 15 min (≈0,2 mm/h): por debajo cuenta como seco
const NC_WINDOW_MIN = 120;    // ventana que contamos: 2 horas

const localNowKey = (tz) => {
    try {
        return new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
            .format(new Date()).replace(' ', 'T');
    } catch { return null; }
};
// Fechas "YYYY-MM-DDTHH:mm" sin zona → milisegundos comparables entre sí
const naiveMs = (s) => Date.parse(s.slice(0, 16) + ':00Z');

const intensityOf = (mmh) => mmh >= 10 ? 'heavy' : mmh >= 2 ? 'moderate' : 'light';
const INTENSITY_TXT = { light: 'débil', moderate: 'moderada', heavy: 'fuerte' };
const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const roundTo5 = (m) => Math.max(5, Math.round(m / 5) * 5);
const fmtMins = (m) => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;

function buildNowcast(data) {
    const nc = data.nowcast, tz = data.location && data.location.timezone;
    const isSnow = !!(data.current && data.current.temp <= 1);
    const W = isSnow
        ? { noun: 'nieve', verb: 'nevar', now: 'Nevando ahora', stop: 'Deja de nevar' }
        : { noun: 'lluvia', verb: 'llover', now: 'Lloviendo ahora', stop: 'Para de llover' };
    const nowKey = tz ? localNowKey(tz) : null;

    // --- Modo minuto a minuto (próximas 2 h) ---
    if (nc && nc.time && nc.time.length && nowKey) {
        const now = naiveMs(nowKey);
        const slots = nc.time
            .map((t, i) => ({ t, end: naiveMs(t), mm: nc.precipitation[i] || 0 }))
            .filter(sl => sl.end > now)
            .slice(0, 8)
            .map(sl => ({
                ...sl,
                mmh: sl.mm * 4,
                wet: sl.mm >= NC_WET,
                startOff: Math.max(0, (sl.end - 15 * 60000 - now) / 60000),
                endOff: (sl.end - now) / 60000
            }));

        if (slots.length >= 4) {
            const firstWet = slots.findIndex(sl => sl.wet);
            const peak = slots.reduce((m, sl) => Math.max(m, sl.mmh), 0);
            const peakTxt = INTENSITY_TXT[intensityOf(peak)];
            const clock = (sl) => sl.t.slice(11, 16);                                          // fin del tramo
            const clockStart = (sl) => new Date(sl.end - 15 * 60000).toISOString().slice(11, 16); // inicio del tramo
            let text = null, pill = null;

            if (firstWet === 0) {
                const firstDry = slots.findIndex(sl => !sl.wet);
                if (firstDry === -1) {
                    text = `<b>${W.now}</b>, ${peakTxt}. Seguirá al menos las próximas 2 horas.`;
                    pill = `${W.now} · sigue las próximas 2 h`;
                } else {
                    const lastWet = slots[firstDry - 1];
                    text = `<b>${W.now}</b> (${peakTxt}). ${W.stop} hacia las <b>${clock(lastWet)}</b>.`;
                    pill = `${W.stop} en ${fmtMins(roundTo5(lastWet.endOff))}`;
                }
            } else if (firstWet > 0) {
                const startMin = roundTo5(slots[firstWet].startOff);
                const rest = slots.slice(firstWet);
                const dryAfter = rest.findIndex(sl => !sl.wet);
                const dur = dryAfter === -1 ? null : roundTo5(rest[dryAfter - 1].endOff - slots[firstWet].startOff);
                text = `Empieza a ${W.verb} en <b>${fmtMins(startMin)}</b> (${peakTxt})` +
                    (dur ? `, durante unos ${fmtMins(dur)}.` : ' y seguirá un buen rato.') +
                    `<small>Hacia las ${clockStart(slots[firstWet])}</small>`;
                pill = `${capitalize(W.noun)} en ${fmtMins(startMin)}`;
            }

            if (text) {
                // Marcas del eje según cuántos tramos hay (cada tramo = 15 min)
                const n = slots.length;
                const marks = [['Ahora', 0]];
                [[2, '30 min'], [4, '1 h'], [6, '1 h 30'], [8, '2 h']].forEach(([k, label]) => { if (k <= n) marks.push([label, (k / n) * 100]); });
                return {
                    mode: 'minutely', text, pill, isSnow,
                    summary: capitalize(peakTxt),
                    bars: slots.map((sl, i) => ({ mmh: sl.mmh, wet: sl.wet, isNow: i === 0 })),
                    axis: marks
                };
            }
        }
    }

    // --- Sin lluvia en 2 h: ¿la hay en las próximas horas? (modo horario) ---
    const hourly = (data.hourly || []).slice(0, 6);
    const hTotal = hourly.reduce((a, h) => a + (h.precip || 0), 0);
    if (hourly.length && hTotal >= 0.1) {
        // El valor horario es lo que cae en la hora ANTERIOR: "14:00" = 13:00–14:00
        const startOfHour = (t) => isNaN(parseInt(t, 10)) ? t : `${String((parseInt(t, 10) + 23) % 24).padStart(2, '0')}:00`;
        const firstWetH = hourly.find(h => (h.precip || 0) >= 0.1);
        const peak = hourly.reduce((m, h) => Math.max(m, h.precip || 0), 0);
        const n = hourly.length;
        return {
            mode: 'hourly', pill: null, isSnow,
            text: firstWetH
                ? `Sin ${W.noun} ahora mismo. Probable hacia las <b>${startOfHour(firstWetH.displayTime)}</b>.`
                : `Posible ${W.noun} débil en las próximas horas.`,
            summary: capitalize(INTENSITY_TXT[intensityOf(peak)]),
            bars: hourly.map((h, i) => ({ mmh: h.precip || 0, wet: (h.precip || 0) >= 0.1, isNow: i === 0 })),
            axis: hourly
                .map((h, i) => [i === 0 ? 'Ahora' : startOfHour(h.displayTime), (i / n) * 100])
                .filter((_, i) => i % 2 === 0)
        };
    }
    return null;
}

// Altura en escala logarítmica: 1 mm/h ya se ve, 20 mm/h llena la barra
const barHeight = (mmh, wet) => wet ? Math.max(0.12, Math.min(1, Math.log10(1 + mmh) / Math.log10(21))) : 0.04;

function renderNowcast(data) {
    const card = document.getElementById('rain-card');
    const pillEl = document.getElementById('nowcast-pill');
    if (!card) return;
    const nc = buildNowcast(data);

    if (!nc) {
        card.style.display = 'none';
        if (pillEl) pillEl.hidden = true;
        return;
    }
    card.style.display = 'block';
    document.getElementById('rain-title').textContent =
        `${nc.isSnow ? 'Nieve' : 'Lluvia'} ${nc.mode === 'minutely' ? 'próximas 2 h' : 'próximas horas'}`;
    document.getElementById('rain-summary').textContent = nc.summary;
    // Texto montado aquí con números y horas propias: no lleva datos externos sin escapar
    setHTMLIfChanged(document.getElementById('nowcast-text'), nc.text);
    // La cuenta atrás cambia cada minuto: a VoiceOver solo se le dice el cambio
    // de estado (empieza / para / sin lluvia), no "24 min… 23 min…"
    const live = document.getElementById('nowcast-live');
    const state = nc.pill ? 'wet' : 'dry';
    if (live && live.dataset.state !== state) { live.dataset.state = state; live.textContent = nc.summary || ''; }

    // Las barras solo crecen al llegar a un sitio nuevo; el repintado de cada
    // minuto (para las cuentas atrás) no las vuelve a animar
    const chart = document.getElementById('nowcast-chart');
    const barsHtml = nc.bars.map((b, i) => {
        const cls = !b.wet ? '' : (nc.isSnow ? 'snow' : intensityOf(b.mmh));
        return `<span class="nc-bar ${cls}${b.isNow ? ' is-now' : ''}"><i style="height:${(barHeight(b.mmh, b.wet) * 100).toFixed(1)}%;animation-delay:${i * 20}ms"></i></span>`;
    }).join('');
    if (setHTMLIfChanged(chart, barsHtml)) chart.classList.toggle('is-animated', chart._place !== currentId);
    chart._place = currentId;
    setHTMLIfChanged(document.getElementById('nowcast-axis'),
        nc.axis.map(([label, pct]) => `<span style="left:${pct.toFixed(1)}%">${label}</span>`).join(''));
    const legend = card.querySelector('.nowcast-legend');
    if (legend) legend.style.display = nc.isSnow ? 'none' : '';

    if (pillEl) {
        pillEl.hidden = !nc.pill;
        pillEl.classList.toggle('is-snow', nc.isSnow);
        if (nc.pill) document.getElementById('nowcast-pill-text').textContent = nc.pill;
    }
}

// Las cuentas atrás ("en 25 min") caducan: se recalculan cada minuto con los
// datos que ya hay, y se piden datos nuevos si tienen más de 10 min.
let lastFetchAt = 0;
setInterval(() => {
    if (document.visibilityState !== 'visible' || !window._lastFullData) return;
    renderNowcast(window._lastFullData);
}, 60000);
const refreshIfStale = () => {
    if (document.visibilityState === 'visible' && lastFetchAt && Date.now() - lastFetchAt > 10 * 60000) getWeather(currentId);
};
document.addEventListener('visibilitychange', refreshIfStale);
setInterval(refreshIfStale, 60000);

// ============================================================
// 24. POLLEN, ALERTAS, LIFESTYLE
// ============================================================

// Calcula la mejor ventana horaria para una actividad dado el forecast horario
function getBestWindows(activityId, hourly) {
    if (!hourly || hourly.length === 0) return null;
    const getHour = (t) => {
        if (!t || t === 'Ahora') return new Date().getHours();
        return parseInt(t.split(':')[0]) || 0;
    };
    const isRainyIcon = (icon) => icon && (icon.includes('rain') || icon.includes('drizzle') || icon.includes('thunder') || icon.includes('lightning'));
    const criteria = {
        run:   (h) => h.rainProb < 30 && h.temp >= 5  && h.temp <= 28 && !isRainyIcon(h.icon),
        cycle: (h) => h.rainProb < 20 && h.temp >= 8  && h.temp <= 30 && !isRainyIcon(h.icon),
        bbq:   (h) => h.rainProb < 15 && h.temp >= 15 && !isRainyIcon(h.icon),
        car:   (h) => h.rainProb < 5  && h.temp >= 4  && !isRainyIcon(h.icon),
        star:  (h) => { const hr = getHour(h.displayTime); return (hr >= 21 || hr <= 6) && h.rainProb < 15; },
        dog:   (h) => h.rainProb < 40 && h.temp >= 2  && h.temp <= 28,
        beach: (h) => h.rainProb < 20 && h.temp >= 24 && !isRainyIcon(h.icon),
        drive: (h) => h.rainProb < 50 && !isRainyIcon(h.icon),
    };
    const rule = criteria[activityId];
    if (!rule) return null;
    // Solo horas razonables (7–22 h), salvo para ver estrellas
    const check = activityId === 'star' ? rule : (h) => { const hr = getHour(h.displayTime); return hr >= 7 && hr <= 22 && rule(h); };
    // Índices de horas válidas
    const goodIdx = hourly.reduce((acc, h, i) => { if (check(h)) acc.push(i); return acc; }, []);
    if (goodIdx.length === 0) return null;
    // Agrupar índices consecutivos en ventanas
    const windows = [];
    let ws = goodIdx[0], wp = goodIdx[0];
    for (let i = 1; i < goodIdx.length; i++) {
        if (goodIdx[i] - wp > 1) { windows.push([ws, wp]); ws = goodIdx[i]; }
        wp = goodIdx[i];
    }
    windows.push([ws, wp]);
    // Elegir la ventana más larga
    windows.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
    const [si, ei] = windows[0];
    const sH   = getHour(hourly[si].displayTime);
    const eH   = getHour(hourly[ei].displayTime) + 1;
    // Formato compacto ("16–18h") para que quepa en la tarjeta de actividad
    return si === ei ? `${sH}h` : `${sH}–${eH}h`;
}

const renderPollen = (pollen) => {
    const card = document.getElementById('pollen-card'), list = document.getElementById('pollen-list');
    if (!pollen || Object.values(pollen).every(v => v === 0)) { card.style.display = 'none'; return false; }
    const types = [
        { k: 'grass', n: 'Gramíneas', color: '#84cc16' }, { k: 'olive', n: 'Olivo', color: '#eab308' },
        { k: 'birch', n: 'Abedul', color: '#f97316' }, { k: 'ragweed', n: 'Ambrosía', color: '#ef4444' },
        { k: 'alder', n: 'Aliso', color: '#a855f7' }, { k: 'mugwort', n: 'Artemisa', color: '#06b6d4' },
        { k: 'oak', n: 'Roble', color: '#854d0e' }, { k: 'pine', n: 'Pino', color: '#166534' },
        { k: 'cypress', n: 'Ciprés', color: '#14b8a6' }, { k: 'hazel', n: 'Avellano', color: '#d97706' },
        { k: 'plane', n: 'P. Sombra', color: '#86efac' }, { k: 'poplar', n: 'Chopo', color: '#cbd5e1' },
        { k: 'ash', n: 'Fresno', color: '#64748b' }
    ];
    types.sort((a, b) => (pollen[b.k] || 0) - (pollen[a.k] || 0));
    const activeTypes = types.filter(t => pollen[t.k] > 5).slice(0, 4);
    if (activeTypes.length === 0) { card.style.display = 'none'; return false; }
    card.style.display = 'block';
    let isHigh = false;
    const html = activeTypes.map(t => {
        const val = pollen[t.k] || 0, percent = Math.min((val / 100) * 100, 100);
        if (val > 50) isHigh = true;
        return `<div class="pollen-item"><span class="pollen-name">${t.n}</span><div class="pollen-bar-bg"><div class="pollen-bar-fill" style="width:${percent}%;background-color:${t.color}"></div></div><span class="pollen-val">${val}</span></div>`;
    }).join('');
    // Igual que el nowcast: las barras se revelan al cambiar de sitio, no en cada refresco
    if (setHTMLIfChanged(list, html)) list.classList.toggle('is-animated', list._place !== currentId);
    list._place = currentId;
    return isHigh;
};

// Avisos OFICIALES de AEMET Meteoalerta (por comunidad autónoma), aparte
// de las alertas propias calculadas por umbrales. Vienen ya filtrados y
// ordenados (rojo > naranja > amarillo) desde el servidor.
const AEMET_NIVEL_CLASE = { rojo: '', naranja: 'orange', amarillo: 'yellow' };
// "Hoy 14:00–23:59" / "Mañana 10:00–19:59" en la hora de la ciudad
function avisoRango(onset, expires, tz) {
    if (!onset) return '';
    const opt = tz ? { timeZone: tz } : {};
    try {
        const day = (d) => new Intl.DateTimeFormat('sv-SE', { ...opt, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
        const hm = (d) => new Intl.DateTimeFormat('es-ES', { ...opt, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
        const a = new Date(onset), b = expires ? new Date(expires) : null;
        const today = day(new Date()), tomorrow = day(new Date(Date.now() + 86400000));
        const label = day(a) === today ? 'Hoy' : day(a) === tomorrow ? 'Mañana' : new Intl.DateTimeFormat('es-ES', { ...opt, weekday: 'long' }).format(a);
        // Si ya ha empezado, lo que importa es hasta cuándo
        if (a <= new Date() && b) return `Hasta las ${hm(b)}${day(b) !== today ? ' de ' + (day(b) === tomorrow ? 'mañana' : new Intl.DateTimeFormat('es-ES', { ...opt, weekday: 'long' }).format(b)) : ''}`;
        return `${label} ${hm(a)}${b ? '–' + hm(b) : ''}`;
    } catch (e) { return ''; }
}

// Mismo nivel, misma franja y misma zona = un solo aviso con los fenómenos
// juntos ("Lluvias y tormentas"). Antes salía una tarjeta por fenómeno y la
// zona repetida en el título y en el texto.
const NIVEL_TXT = { rojo: 'rojo', naranja: 'naranja', amarillo: 'amarillo' };
function groupAvisos(avisos) {
    const groups = new Map();
    for (const a of avisos) {
        const k = `${a.nivel}|${a.onset}|${a.expires}|${(a.zonas || []).join(',')}`;
        if (!groups.has(k)) groups.set(k, { ...a, fenomenos: [] });
        const g = groups.get(k);
        if (!g.fenomenos.includes(a.fenomeno)) g.fenomenos.push(a.fenomeno);
        // Del texto de AEMET nos quedamos con los datos útiles (acumulados, rachas…)
        if (a.descripcion && !(g.detalles || []).includes(a.descripcion)) g.detalles = [...(g.detalles || []), a.descripcion];
    }
    return [...groups.values()];
}
const joinEs = (arr) => arr.length <= 1 ? (arr[0] || '') : `${arr.slice(0, -1).join(', ')} y ${arr[arr.length - 1]}`;

const renderAemetAvisos = (avisos) => {
    if (!avisos || avisos.length === 0) return '';
    const tz = window._lastFullData?.location?.timezone;
    return groupAvisos(avisos).map(g => {
        const cls = AEMET_NIVEL_CLASE[g.nivel] || '';
        const fen = joinEs(g.fenomenos.map(f => f.toLowerCase()));
        const titulo = `${fen.charAt(0).toUpperCase()}${fen.slice(1)} · nivel ${NIVEL_TXT[g.nivel] || g.nivel}`;
        const zona = (g.zonas && g.zonas.length) ? g.zonas.slice(0, 2).join(', ') + (g.zonas.length > 2 ? '…' : '') : '';
        const rango = avisoRango(g.onset, g.expires, tz);
        // "Precipitación acumulada en una hora: 30 mm. Valle del…": sin la zona repetida
        const detalle = (g.detalles || [])
            .map(d => (g.zonas || []).reduce((t, z) => t.split(z).join(''), d).replace(/[\s.·,]+$/, '').trim())
            .filter(Boolean).join(' · ');
        const meta = [rango, zona].filter(Boolean).map(escapeHTML).join(' · ');
        return `<div class="alert-card ${cls}">
            <i class="bi bi-shield-fill-exclamation alert-icon"></i>
            <div>
                <span class="aemet-badge">AEMET OFICIAL</span>
                <div class="fw-bold">${escapeHTML(titulo)}</div>
                <div class="small opacity-75">${meta}</div>
                ${detalle ? `<div class="small opacity-75">${escapeHTML(detalle)}</div>` : ''}
            </div>
        </div>`;
    }).join('');
};

const renderAlerts = (alerts, avisosOficiales) => {
    const container = document.getElementById('alerts-container');
    const propias = (!alerts || alerts.length === 0) ? '' :
        alerts.map(a => `<div class="alert-card ${a.level}"><i class="bi bi-exclamation-triangle-fill alert-icon"></i><div><div class="fw-bold">${a.title}</div><div class="small opacity-75">${a.msg}</div></div></div>`).join('');
    setHTMLIfChanged(container, renderAemetAvisos(avisosOficiales) + propias);
};

// Iconos de actividades: Font Awesome Free 6.5.1 (iconos CC BY 4.0,
// https://fontawesome.com/license/free) en línea, para no cargar la
// librería entera (CSS + fuente) por 8 iconos. [viewBox, path]
const ACTIVITY_ICONS = {
    run: ['0 0 448 512', 'M320 48a48 48 0 1 0 -96 0 48 48 0 1 0 96 0zM125.7 175.5c9.9-9.9 23.4-15.5 37.5-15.5c1.9 0 3.8 .1 5.6 .3L137.6 254c-9.3 28 1.7 58.8 26.8 74.5l86.2 53.9-25.4 88.8c-4.9 17 5 34.7 22 39.6s34.7-5 39.6-22l28.7-100.4c5.9-20.6-2.6-42.6-20.7-53.9L238 299l30.9-82.4 5.1 12.3C289 264.7 323.9 288 362.7 288H384c17.7 0 32-14.3 32-32s-14.3-32-32-32H362.7c-12.9 0-24.6-7.8-29.5-19.7l-6.3-15c-14.6-35.1-44.1-61.9-80.5-73.1l-48.7-15c-11.1-3.4-22.7-5.2-34.4-5.2c-31 0-60.8 12.3-82.7 34.3L57.4 153.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l23.1-23.1zM91.2 352H32c-17.7 0-32 14.3-32 32s14.3 32 32 32h69.6c19 0 36.2-11.2 43.9-28.5L157 361.6l-9.5-6c-17.5-10.9-30.5-26.8-37.9-44.9L91.2 352z'],
    cycle: ['0 0 640 512', 'M312 32c-13.3 0-24 10.7-24 24s10.7 24 24 24h25.7l34.6 64H222.9l-27.4-38C191 99.7 183.7 96 176 96H120c-13.3 0-24 10.7-24 24s10.7 24 24 24h43.7l22.1 30.7-26.6 53.1c-10-2.5-20.5-3.8-31.2-3.8C57.3 224 0 281.3 0 352s57.3 128 128 128c65.3 0 119.1-48.9 127-112h49c8.5 0 16.3-4.5 20.7-11.8l84.8-143.5 21.7 40.1C402.4 276.3 384 312 384 352c0 70.7 57.3 128 128 128s128-57.3 128-128s-57.3-128-128-128c-13.5 0-26.5 2.1-38.7 6L375.4 48.8C369.8 38.4 359 32 347.2 32H312zM458.6 303.7l32.3 59.7c6.3 11.7 20.9 16 32.5 9.7s16-20.9 9.7-32.5l-32.3-59.7c3.6-.6 7.4-.9 11.2-.9c39.8 0 72 32.2 72 72s-32.2 72-72 72s-72-32.2-72-72c0-18.6 7-35.5 18.6-48.3zM133.2 368h65c-7.3 32.1-36 56-70.2 56c-39.8 0-72-32.2-72-72s32.2-72 72-72c1.7 0 3.4 .1 5.1 .2l-24.2 48.5c-9 18.1 4.1 39.4 24.3 39.4zm33.7-48l50.7-101.3 72.9 101.2-.1 .1H166.8zm90.6-128H365.9L317 274.8 257.4 192z'],
    bbq: ['0 0 512 512', 'M61.1 224C45 224 32 211 32 194.9c0-1.9 .2-3.7 .6-5.6C37.9 168.3 78.8 32 256 32s218.1 136.3 223.4 157.3c.5 1.9 .6 3.7 .6 5.6c0 16.1-13 29.1-29.1 29.1H61.1zM144 128a16 16 0 1 0 -32 0 16 16 0 1 0 32 0zm240 16a16 16 0 1 0 0-32 16 16 0 1 0 0 32zM272 96a16 16 0 1 0 -32 0 16 16 0 1 0 32 0zM16 304c0-26.5 21.5-48 48-48H448c26.5 0 48 21.5 48 48s-21.5 48-48 48H64c-26.5 0-48-21.5-48-48zm16 96c0-8.8 7.2-16 16-16H464c8.8 0 16 7.2 16 16v16c0 35.3-28.7 64-64 64H96c-35.3 0-64-28.7-64-64V400z'],
    car: ['0 0 640 512', 'M171.3 96H224v96H111.3l30.4-75.9C146.5 104 158.2 96 171.3 96zM272 192V96h81.2c9.7 0 18.9 4.4 25 12l67.2 84H272zm256.2 1L428.2 68c-18.2-22.8-45.8-36-75-36H171.3c-39.3 0-74.6 23.9-89.1 60.3L40.6 196.4C16.8 205.8 0 228.9 0 256V368c0 17.7 14.3 32 32 32H65.3c7.6 45.4 47.1 80 94.7 80s87.1-34.6 94.7-80H385.3c7.6 45.4 47.1 80 94.7 80s87.1-34.6 94.7-80H608c17.7 0 32-14.3 32-32V320c0-65.2-48.8-119-111.8-127zM434.7 368a48 48 0 1 1 90.5 32 48 48 0 1 1 -90.5-32zM160 336a48 48 0 1 1 0 96 48 48 0 1 1 0-96z'],
    star: ['0 0 576 512', 'M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z'],
    dog: ['0 0 576 512', 'M309.6 158.5L332.7 19.8C334.6 8.4 344.5 0 356.1 0c7.5 0 14.5 3.5 19 9.5L392 32h52.1c12.7 0 24.9 5.1 33.9 14.1L496 64h56c13.3 0 24 10.7 24 24v24c0 44.2-35.8 80-80 80H464 448 426.7l-5.1 30.5-112-64zM416 256.1L416 480c0 17.7-14.3 32-32 32H352c-17.7 0-32-14.3-32-32V364.8c-24 12.3-51.2 19.2-80 19.2s-56-6.9-80-19.2V480c0 17.7-14.3 32-32 32H96c-17.7 0-32-14.3-32-32V249.8c-28.8-10.9-51.4-35.3-59.2-66.5L1 167.8c-4.3-17.1 6.1-34.5 23.3-38.8s34.5 6.1 38.8 23.3l3.9 15.5C70.5 182 83.3 192 98 192h30 16H303.8L416 256.1zM464 80a16 16 0 1 0 -32 0 16 16 0 1 0 32 0z'],
    beach: ['0 0 576 512', 'M346.3 271.8l-60.1-21.9L214 448H32c-17.7 0-32 14.3-32 32s14.3 32 32 32H544c17.7 0 32-14.3 32-32s-14.3-32-32-32H282.1l64.1-176.2zm121.1-.2l-3.3 9.1 67.7 24.6c18.1 6.6 38-4.2 39.6-23.4c6.5-78.5-23.9-155.5-80.8-208.5c2 8 3.2 16.3 3.4 24.8l.2 6c1.8 57-7.3 113.8-26.8 167.4zM462 99.1c-1.1-34.4-22.5-64.8-54.4-77.4c-.9-.4-1.9-.7-2.8-1.1c-33-11.7-69.8-2.4-93.1 23.8l-4 4.5C272.4 88.3 245 134.2 226.8 184l-3.3 9.1L434 269.7l3.3-9.1c18.1-49.8 26.6-102.5 24.9-155.5l-.2-6zM107.2 112.9c-11.1 15.7-2.8 36.8 15.3 43.4l71 25.8 3.3-9.1c19.5-53.6 49.1-103 87.1-145.5l4-4.5c6.2-6.9 13.1-13 20.5-18.2c-79.6 2.5-154.7 42.2-201.2 108z'],
    drive: ['0 0 576 512', 'M256 32H181.2c-27.1 0-51.3 17.1-60.3 42.6L3.1 407.2C1.1 413 0 419.2 0 425.4C0 455.5 24.5 480 54.6 480H256V416c0-17.7 14.3-32 32-32s32 14.3 32 32v64H521.4c30.2 0 54.6-24.5 54.6-54.6c0-6.2-1.1-12.4-3.1-18.2L455.1 74.6C446 49.1 421.9 32 394.8 32H320V96c0 17.7-14.3 32-32 32s-32-14.3-32-32V32zm64 192v64c0 17.7-14.3 32-32 32s-32-14.3-32-32V224c0-17.7 14.3-32 32-32s32 14.3 32 32z']
};
const activityIcon = (id) => {
    const [vb, d] = ACTIVITY_ICONS[id];
    return `<svg class="activity-icon" viewBox="${vb}" aria-hidden="true" focusable="false"><path fill="currentColor" d="${d}"/></svg>`;
};

const renderLifestyle = (cur, daily, hourly) => {
    const list = document.getElementById('lifestyle-list');
    if (!list || !daily) return;
    const desc = cur.desc.toLowerCase();
    const isRain  = desc.includes('lluvia') || desc.includes('llovizna') || desc.includes('tormenta') || desc.includes('chubasco');
    const isSnow  = desc.includes('nieve')  || desc.includes('aguanieve') || desc.includes('granizo');
    const isFog   = desc.includes('niebla') || desc.includes('bruma');
    const isStorm = desc.includes('tormenta') || desc.includes('trueno');
    const probToday    = daily[0] ? (daily[0].rainProbMax || 0) : 0;
    const probTomorrow = daily[1] ? (daily[1].rainProbMax || 0) : 0;
    const activities = [
        { id: 'run',   name: 'Running',       check: () => { if (isRain || isSnow || cur.temp > 32 || cur.temp < -5 || cur.windSpeed > 35) return 'bad'; if (probToday > 50 || cur.temp > 26 || cur.temp < 5 || cur.windSpeed > 20) return 'fair'; return 'good'; } },
        { id: 'cycle', name: 'Ciclismo',      check: () => { if (isRain || isSnow || cur.windSpeed > 30 || cur.temp > 35) return 'bad'; if (cur.windSpeed > 15 || cur.temp < 5 || cur.temp > 28) return 'fair'; return 'good'; } },
        { id: 'bbq',   name: 'Barbacoa',      check: () => { if (isRain || isSnow || probToday > 30 || cur.windSpeed > 25) return 'bad'; if (cur.temp < 15 || probToday > 10 || cur.windSpeed > 15) return 'fair'; return 'good'; } },
        { id: 'car',   name: 'Lavar Coche',   check: () => { if (isRain || isSnow || probToday >= 10 || probTomorrow >= 10) return 'bad'; if (cur.temp < 4 || probToday > 0 || probTomorrow > 0) return 'fair'; return 'good'; } },
        { id: 'star',  name: 'Estrellas',     check: () => { if (cur.isDay || cur.cloudCover > 50 || isRain || isSnow) return 'bad'; if (cur.cloudCover > 20) return 'fair'; return 'good'; } },
        { id: 'dog',   name: 'Paseo Perro',   check: () => { if (isStorm || isRain || cur.temp > 30 || cur.temp < -10) return 'bad'; if (probToday > 50 || cur.temp > 25 || cur.temp < 5) return 'fair'; return 'good'; } },
        { id: 'beach', name: 'Playa',         check: () => { if (isRain || cur.temp < 22 || cur.windSpeed > 25) return 'bad'; if (cur.cloudCover > 60 || cur.windSpeed > 15 || cur.temp < 25) return 'fair'; return 'good'; } },
        { id: 'drive', name: 'Conducir',      check: () => { if (isFog || isSnow || isStorm || cur.windSpeed > 50) return 'bad'; if (isRain || cur.windSpeed > 30 || probToday > 60) return 'fair'; return 'good'; } }
    ];
    setHTMLIfChanged(list, activities.map(act => {
        const status  = act.check();
        const window  = getBestWindows(act.id, hourly);
        // Si el estado actual es malo pero hay ventana, mostrarla como "rescue window"
        const timeLabel = window
            ? (status === 'bad' ? `↗ ${window}` : window)
            : (status === 'bad' ? 'Hoy no' : '');
        const ariaLabel = `${act.name}: ${status === 'good' ? 'Ideal' : status === 'fair' ? 'Regular' : 'Malo'}${timeLabel ? '. ' + timeLabel : ''}`;
        return `<div class="activity-item" role="img" aria-label="${ariaLabel}">
            ${activityIcon(act.id)}
            <div class="status-dot status-${status}"></div>
            <span class="activity-name">${act.name}</span>
            <span class="activity-time${status === 'bad' && window ? ' activity-time--rescue' : ''}">${timeLabel}</span>
        </div>`;
    }).join(''));
};

// ============================================================
// 25. toggleDay
// ============================================================
// El acordeón se anima en CSS (grid-template-rows 0fr → 1fr); aquí solo
// cambiamos el estado, así es interrumpible si se toca dos veces seguidas.
window.toggleDay = (index) => {
    const item = document.getElementById(`day-item-${index}`);
    if (!item) return;
    const open = item.classList.toggle('open');
    const btn = item.querySelector('.day-row');
    if (btn) btn.setAttribute('aria-expanded', open);
};

// Acciones por delegación. La CSP de Helmet incluye script-src-attr 'none',
// así que los onclick="" en el HTML se bloquean: todo va por listeners.
document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    switch (el.dataset.action) {
        case 'toggle-day':     toggleDay(Number(el.dataset.day)); break;
        case 'close-share':    closeShareModal(); break;
        case 'close-notif':    closeNotifModal(); break;
        case 'download-share': downloadShareCard(el); break;
        case 'retry':          retryWeather(); break;
        case 'goto-rain': {
            const card = document.getElementById('rain-card');
            const navH = document.querySelector('.nav-bar')?.offsetHeight || 0;
            if (card) window.scrollTo({ top: card.getBoundingClientRect().top + window.pageYOffset - navH - 6, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
            break;
        }
    }
});

// Modal de pedir avisos
const notifModal = document.getElementById('notificationModal');
// Se pregunta una sola vez: después queda la campana del hero
function openNotifModal() {
    if (!notifModal || notifPermission() !== 'default') return;
    try { if (localStorage.getItem('aeris_notif_asked')) return; localStorage.setItem('aeris_notif_asked', '1'); } catch (e) {}
    notifModal.classList.add('show');
    document.getElementById('enableNotifBtn')?.focus({ preventScroll: true });
}
function closeNotifModal() { notifModal?.classList.remove('show'); }
notifModal?.addEventListener('click', (e) => { if (e.target === notifModal) closeNotifModal(); });
document.getElementById('enableNotifBtn')?.addEventListener('click', () => {
    closeNotifModal();
    registerPush(false); // dentro del toque: Safari solo pide el permiso así
});

// Modal iOS: tocar el fondo cierra; tocar la hoja no
document.getElementById('iosInstallModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'iosInstallModal') closeIosModal();
});

// Radar: quitar el esqueleto cuando carga el mapa de verdad (no el about:blank inicial)
const radarFrame = document.getElementById('radar-frame');
radarFrame?.addEventListener('load', () => {
    if (radarFrame.getAttribute('src')) document.getElementById('radar-skeleton').style.display = 'none';
});

// Logo del splash: si no carga, icono de reserva
(function () {
    const img = document.getElementById('splash-logo');
    if (!img) return;
    const fallback = () => { img.style.display = 'none'; if (img.nextElementSibling) img.nextElementSibling.style.display = 'block'; };
    if (img.complete && img.naturalWidth === 0) fallback();
    else img.addEventListener('error', fallback);
})();

// ============================================================
// 26. PUSH NOTIFICATIONS
// ============================================================
// La API de notificaciones no existe en Safari de iPhone sin instalar la app
// ni en los navegadores internos de TikTok/Instagram: comprobar SIEMPRE antes
// de tocar `Notification`, o el error corta la carga de la app entera.
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const notifPermission = () => ('Notification' in window) ? Notification.permission : 'unsupported';
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

let vapidKeyPromise = null;
const getVapidKey = () => vapidKeyPromise || (vapidKeyPromise = fetch('/api/vapid-key')
    .then(r => r.ok ? r.json() : null).then(j => j && j.key).catch(() => null));

// navigator.serviceWorker.ready no falla nunca: si el worker no se instala,
// se queda esperando para siempre. Con límite, el usuario al menos sabe qué pasa.
const swReady = (ms = 10000) => Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('sw-timeout')), ms))
]);

const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from(rawData, ch => ch.charCodeAt(0));
};

// silent = re-suscripción en segundo plano (mantiene la ciudad al día);
// si no, es el usuario pulsando "Activar" y merece saber qué ha pasado.
async function registerPush(silent = false) {
    const say = (msg, type) => { if (!silent) showToast(msg, type); };
    if (!pushSupported()) {
        return say(isIOS()
            ? 'En iPhone, instala AERIS en la pantalla de inicio (Compartir → Añadir a inicio) para recibir avisos.'
            : 'Este navegador no admite notificaciones.', 'warn');
    }
    if (silent && notifPermission() !== 'granted') return;
    try {
        // El permiso se pide ANTES de cualquier await: Safari solo muestra el
        // diálogo si la petición sale directamente del toque del usuario.
        const permission = notifPermission() === 'granted' ? 'granted' : await Notification.requestPermission();
        if (permission !== 'granted') {
            updateBellUI();
            return say('Has bloqueado las notificaciones. Actívalas en los ajustes del navegador para esta web.', 'warn');
        }
        const key = await getVapidKey();
        if (!key) return say('Las notificaciones no están disponibles ahora mismo. Inténtalo más tarde.', 'warn');
        const register = await swReady();
        const serverKey = urlBase64ToUint8Array(key);
        let subscription = await register.pushManager.getSubscription();
        // Una suscripción hecha con otras claves VAPID (p. ej. de antes de
        // configurarlas bien) nunca recibirá nada: el push service responde 403.
        // Si la clave no coincide con la del servidor, se rehace.
        if (subscription) {
            const subKey = subscription.options && subscription.options.applicationServerKey;
            const sameKey = subKey && subKey.byteLength === serverKey.byteLength &&
                new Uint8Array(subKey).every((b, i) => b === serverKey[i]);
            if (!sameKey) { await subscription.unsubscribe().catch(() => {}); subscription = null; }
        }
        if (!subscription) {
            subscription = await register.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey });
        }
        const lat = currentCityInfo.lat || parseFloat(String(currentCityInfo.id).split(',')[0]);
        const lon = currentCityInfo.lon || parseFloat(String(currentCityInfo.id).split(',')[1]);
        if (!lat || !lon) return say('Elige una ciudad para activar los avisos.', 'warn');

        const res = await fetch('/api/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subscription, lat, lon,
                city: currentCityInfo.name, region: currentCityInfo.region || '',
                timezone: (window._lastFullData && window._lastFullData.location && window._lastFullData.location.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone,
                welcome: !silent
            })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json().catch(() => ({}));
        localStorage.setItem('aeris_push_on', '1');
        updateBellUI();
        if (silent) return;
        // El servidor nos dice si Apple/Google aceptaron la notificación de prueba
        if (result.push && result.push.startsWith('error')) {
            const [, code, detail] = result.push.split(':');
            showToast(`Suscrito, pero ${result.host || 'el servicio push'} rechazó la notificación de prueba (código ${code}${detail ? ': ' + detail.trim() : ''}).`, 'warn');
        } else {
            showToast(`Avisos activados para ${currentCityInfo.name || 'tu zona'}. Te debería llegar una notificación de prueba ahora.`, 'ok');
        }
    } catch (e) {
        console.error('push:', e);
        say(e && e.message === 'sw-timeout'
            ? 'La app aún se está preparando. Ciérrala del todo, vuelve a abrirla y toca la campana otra vez.'
            : 'No se pudieron activar los avisos. Inténtalo de nuevo.', 'warn');
    }
}

// Campana del hero: forma permanente de activar los avisos (el modal solo
// sale una vez y no aparece en iPhone sin instalar ni si se pulsó "Ahora no").
// "Activados" = permiso concedido Y suscripción real en este dispositivo
// (no basta una marca en localStorage: quien se suscribió con una versión
// anterior no la tiene, y una suscripción puede caducar).
async function updateBellUI() {
    const btn = document.getElementById('bellBtn');
    if (!btn) return;
    let on = false;
    if (pushSupported() && notifPermission() === 'granted') {
        try {
            const reg = await swReady();
            on = !!(await reg.pushManager.getSubscription());
        } catch (e) { on = false; }
    }
    if (on) localStorage.setItem('aeris_push_on', '1'); else localStorage.removeItem('aeris_push_on');
    btn.classList.toggle('is-on', on);
    // Mientras está ocupada lleva el icono de carga; se pone al terminar
    if (!btn.classList.contains('is-loading')) btn.querySelector('i').className = on ? 'bi bi-bell-fill' : 'bi bi-bell';
    btn.setAttribute('aria-label', on ? 'Avisos activados' : 'Activar avisos del tiempo');
}
document.getElementById('bellBtn')?.addEventListener('click', () => {
    if (!pushSupported()) {
        if (isIOS()) {
            // En iPhone hay que instalarla primero: enseñamos cómo
            showToast('En iPhone, primero instala AERIS en la pantalla de inicio. Luego ábrela desde ahí y toca la campana.', 'warn');
            if (window.openIosModal) window.openIosModal();
        } else {
            showToast('Este navegador no admite notificaciones. Prueba con Chrome.', 'warn');
        }
        return;
    }
    const perm = notifPermission();
    if (perm === 'denied') {
        return showToast('Las notificaciones están bloqueadas para esta web. Actívalas en los ajustes del navegador (icono del candado junto a la dirección).', 'warn');
    }
    // Si ya están activos, tocarla vuelve a sincronizar la ciudad y manda
    // otra notificación de prueba: sirve para comprobar que siguen llegando.
    const btn = document.getElementById('bellBtn');
    if (btn.disabled) return;
    setBusy(btn, true);
    // pide el permiso aquí mismo si hace falta, dentro del toque
    registerPush(false).finally(() => { setBusy(btn, false); updateBellUI(); });
});

// Toast mínimo: entra y sale por abajo (mismo camino), transición y no
// keyframes para que varios seguidos se reemplacen sin saltos.
let toastTimer = null;
function showToast(message, type = 'ok') {
    let el = document.getElementById('aeris-toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'aeris-toast';
        el.className = 'toast-msg';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.innerHTML = '<i class="bi" aria-hidden="true"></i><span></span>';
        el.addEventListener('click', () => el.classList.remove('show'));
        document.body.appendChild(el);
        void el.offsetWidth; // fija el estado inicial: si no, el primer toast aparece de golpe
    }
    el.querySelector('i').className = `bi ${type === 'ok' ? 'bi-check-circle-fill' : 'bi-info-circle-fill'}`;
    el.querySelector('span').textContent = message;
    el.dataset.type = type;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 5000);
}

// ============================================================
// 27. RENDERIZADO PRINCIPAL
// ============================================================
const renderWeather = (data) => {
    window._lastFullData   = data;
    const cur = data.current, loc = data.location;
    const placeChanged = lastRenderedPlace !== currentId;
    lastRenderedPlace = currentId;

    currentCityInfo = { id: currentId, name: loc.name, region: loc.region, lat: loc.lat, lon: loc.lon };
    lastWeatherData = cur;
    updateHeartUI();

    document.querySelectorAll('.skeleton').forEach(el => { el.classList.remove('skeleton'); el.style.width = ''; el.style.height = ''; el.style.minHeight = ''; });

    // Ciudad
    let displayCity = loc.name;
    const cityEl = document.getElementById('city');
    if (displayCity && displayCity.startsWith("Tu ubicacion (")) displayCity = displayCity.replace("Tu ubicacion", "Tu ubicación");
    if (displayCity && displayCity.startsWith("Tu ubicación")) {
        const match = displayCity.match(/\(([^)]+)\)/);
        cityEl.innerHTML = `<i class="bi bi-cursor-fill hero-loc" aria-hidden="true"></i>${match ? escapeHTML(match[1]) : 'Tu ubicación'}`;
    } else {
        cityEl.innerText = displayCity || 'AERIS';
    }

    // Temperatura con unidades (el ° va en su propio span para afinar la tipografía)
    const tempEl = document.getElementById('temp');
    tempEl.innerHTML = `${fmtTemp(cur.temp)}<span class="deg">°${useFahrenheit ? '<small>F</small>' : ''}</span>`;
    // Solo se funde la pieza que cambió (si solo sube un grado, no se
    // desenfocan también la ciudad y el icono)
    const heroParts = { city: loc.name, temp: `${cur.temp}|${useFahrenheit}`, desc: cur.desc, 'weather-icon-container': cur.icon };
    Object.entries(heroParts).forEach(([id, v]) => {
        if (lastHero[id] !== undefined && lastHero[id] !== v) blurIn(document.getElementById(id));
        lastHero[id] = v;
    });
    document.getElementById('feels-like').innerText = fmtTemp(cur.feelsLike);
    document.getElementById('desc').innerText      = cur.desc;
    document.getElementById('hum').innerText       = cur.humidity;
    document.getElementById('wind').innerText      = fmtWind(cur.windSpeed);
    // Dirección y rachas reales (antes ponía "Viento" si no había dirección)
    const gustTxt = cur.windGust && cur.windGust > cur.windSpeed + 5 ? `rachas ${fmtWind(cur.windGust)}` : '';
    document.getElementById('wind-dir').innerText  = [cur.windDir, gustTxt].filter(Boolean).join(' · ');
    document.getElementById('uv').innerText        = Math.round(cur.uv);
    document.getElementById('compare-txt').innerText = cur.comparison || '';
    updateUnitsUI();

    // Presión + tendencia
    const pressureEl = document.getElementById('pressure');
    if (pressureEl) pressureEl.innerText = cur.pressure || '--';
    updatePressureTrend(cur.pressureTrend);

    // Icono grande
    const renderedIcon = renderIcon(cur.icon, "5.5rem");
    document.getElementById('weather-icon-container').innerHTML = renderedIcon.includes('<img')
        ? renderedIcon
        : `<i class="bi ${cur.icon}" style="font-size:5.5rem;display:inline-block;"></i>`;

    // AQI
    const aqi = cur.aqi || 0;
    let aqiText = "Buena", aqiColor = "#4ade80";
    if (aqi > 300) { aqiText = "Peligrosa"; aqiColor = "#7e22ce"; }
    else if (aqi > 200) { aqiText = "Muy Dañina"; aqiColor = "#a855f7"; }
    else if (aqi > 150) { aqiText = "Dañina"; aqiColor = "#ef4444"; }
    else if (aqi > 100) { aqiText = "Sensible"; aqiColor = "#f97316"; }
    else if (aqi > 50)  { aqiText = "Moderada"; aqiColor = "#eab308"; }
    document.getElementById('aqi-val').innerText  = aqi;
    document.getElementById('aqi-text').innerText = aqiText;
    // El color va en un punto, no en el texto: sobre el cristal el texto de
    // color no llega al contraste mínimo
    document.getElementById('aqi-text').style.setProperty('--tone', aqiColor);
    document.getElementById('pm25').innerText = cur.pm25 !== undefined ? cur.pm25 + (typeof cur.pm25 === 'number' ? ' µg/m³' : '') : '--';
    document.getElementById('pm10').innerText = cur.pm10 !== undefined ? cur.pm10 + (typeof cur.pm10 === 'number' ? ' µg/m³' : '') : '--';
    // transform en vez de left: el punto se desliza sin recalcular layout
    document.getElementById('aqi-dot').style.transform = `translateX(${Math.min((aqi / 300) * 100, 100)}cqw)`;

    // Max/Min
    if (data.daily && data.daily.length > 0) {
        document.getElementById('max-temp').innerText = fmtTemp(data.daily[0].tempMax);
        document.getElementById('min-temp').innerText = fmtTemp(data.daily[0].tempMin);
        document.getElementById('max-temp').classList.remove('skeleton');
        document.getElementById('min-temp').classList.remove('skeleton');
    }

    renderNowcast(data);
    const isHighPollen = renderPollen(data.pollen);
    renderLifestyle(cur, data.daily, data.hourly);
    renderAlerts(data.alerts, data.avisosOficiales);
    updateAIText(cur, isHighPollen);
    setDynamicBackground(cur);
    renderComfort(cur.temp, cur.humidity, cur.windSpeed, cur.uv, cur.desc);
    renderTempChart(data.daily, placeChanged);

    // Solar + luna + hora local + tema auto
    if (data.daily && data.daily[0]) {
        const sunrise = data.daily[0].sunrise, sunset = data.daily[0].sunset;
        renderSolarClock(sunrise, sunset, loc.timezone);
        autoThemeByTime(sunrise, sunset, loc.timezone);
        renderMoon(loc.lat, loc.lon, loc.timezone);
    }
    if (loc.timezone) startLocalTime(loc.timezone);

    // Radar
    if (loc.lat && loc.lon) {
        const radarUrl = `https://embed.windy.com/embed2.html?lat=${loc.lat}&lon=${loc.lon}&detailLat=${loc.lat}&detailLon=${loc.lon}&width=650&height=450&zoom=8&level=surface&overlay=rain&product=ecmwf&menu=&message=&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=km%2Fh&metricTemp=%C2%B0C&radarRange=-1`;
        const iframe = document.getElementById('radar-frame');
        if (iframe && iframe.src !== radarUrl) iframe.src = radarUrl;
    }

    // Hourly
    const hCont = document.getElementById('hourly');
    if (hCont) {
        const changed = setHTMLIfChanged(hCont, data.hourly.map(h =>
            `<div class="hourly-item" role="listitem">
                <span class="h-time">${h.displayTime}</span>
                <span class="h-icon">${renderIcon(h.icon, "")}</span>
                <span class="h-rain">${h.rainProb > 0 ? h.rainProb + '%' : ''}</span>
                <span class="h-temp">${fmtTemp(h.temp)}°</span>
            </div>`
        ).join(''));
        // Vuelve al principio al cambiar de sitio, no si el usuario la había movido
        if (changed && placeChanged) hCont.scrollLeft = 0;
    }

    // Daily: barras de rango sobre la escala de toda la semana (estilo iOS)
    const dCont = document.getElementById('daily');
    if (dCont && data.daily && data.daily.length) {
        const weekMin = Math.min(...data.daily.map(d => d.tempMin));
        const weekMax = Math.max(...data.daily.map(d => d.tempMax));
        const span = Math.max(1, weekMax - weekMin);
        const pos = (t) => Math.max(0, Math.min(100, ((t - weekMin) / span) * 100));
        const todayStr = new Date().toLocaleDateString('sv-SE');
        const openDays = new Set([...dCont.querySelectorAll('.day-item.open')].map(el => el.id));

        setHTMLIfChanged(dCont, data.daily.map((d, index) => {
            const date = new Date(d.fecha.replace(/-/g, '/'));
            const isToday = d.fecha === todayStr;
            const dayName = isToday ? 'Hoy' : date.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '');
            const dayNum = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
            const l = pos(d.tempMin), r = 100 - pos(d.tempMax);
            const nowDot = isToday ? `<span class="day-now" style="left:${pos(cur.temp)}%"></span>` : '';
            const hourlyHtml = d.dayHours && d.dayHours.length > 0
                ? d.dayHours.map(h => {
                    const hour = parseInt(h.time.split(':')[0]);
                    let iconClass = h.icon;
                    if (hour < parseInt(d.sunrise.split(':')[0]) || hour > parseInt(d.sunset.split(':')[0]))
                        iconClass = iconClass.replace('bi-sun', 'bi-moon').replace('bi-cloud-sun', 'bi-cloud-moon');
                    return `<div class="day-hourly-item"><span class="dh-time">${h.time}</span>${renderIcon(iconClass, "")}<span class="dh-temp">${fmtTemp(h.temp)}°</span><span class="dh-rain">${h.rainProb > 0 ? h.rainProb + '%' : ''}</span></div>`;
                }).join('')
                : '<div class="text-center w-100 small" style="color:var(--text-3)">No hay datos horarios</div>';
            const itemId = `day-item-${index}`;
            const isOpen = openDays.has(itemId);
            return `<div class="day-item${isOpen ? ' open' : ''}" id="${itemId}" role="listitem">
                <button type="button" class="day-row" data-action="toggle-day" data-day="${index}" aria-expanded="${isOpen}" aria-controls="day-detail-${index}" aria-label="${escapeHTML(dayName)} ${dayNum}: máxima ${fmtTemp(d.tempMax)}°, mínima ${fmtTemp(d.tempMin)}°. Ver horas">
                    <span class="day-name">${dayName}<small>${dayNum}</small></span>
                    <span class="day-icon">${renderIcon(d.icon, "")}<span class="day-rain">${d.rainProbMax > 0 ? d.rainProbMax + '%' : ''}</span></span>
                    <span class="day-min">${fmtTemp(d.tempMin)}°</span>
                    <span class="day-bar"><span class="day-bar-fill" style="left:${l}%;right:${r}%;background:linear-gradient(90deg,${tempColor(d.tempMin)},${tempColor(d.tempMax)})"></span>${nowDot}</span>
                    <span class="day-max">${fmtTemp(d.tempMax)}°</span>
                    <i class="bi bi-chevron-down day-chev" aria-hidden="true"></i>
                </button>
                <div id="day-detail-${index}" class="day-detail">
                    <div class="day-detail-inner"><div class="day-detail-body">
                        <div class="day-sun"><span><i class="bi bi-sunrise"></i> ${d.sunrise}</span><span><i class="bi bi-sunset"></i> ${d.sunset}</span></div>
                        <div class="day-detail-content">${hourlyHtml}</div>
                    </div></div>
                </div>
            </div>`;
        }).join(''));
    }

    // Animación clima
    startWeatherAnimation(getAnimationType(cur.desc, cur.isDay));

    if (pendingSection) {
        const target = { lluvia: 'rain-card', avisos: 'alerts-container' }[pendingSection];
        pendingSection = null;
        const el = target && document.getElementById(target);
        if (el && el.offsetParent !== null) setTimeout(() => {
            const navH = document.querySelector('.nav-bar')?.offsetHeight || 0;
            window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - navH - 8, behavior: 'auto' });
        }, Math.max(0, SPLASH_MIN_MS - performance.now()) + 50);
    }

    hideSplash();
};

// ============================================================
// 28. FETCH PRINCIPAL
// ============================================================
// Hasta 3 intentos: un fallo puntual (el móvil recién despierto que aún no
// ha recuperado la red, un tropiezo de Open-Meteo...) no debe dejar al
// usuario sin datos. Los errores del cliente (ciudad no encontrada) no se
// reintentan; el 429 sí, porque es pasajero.
async function fetchWeatherData(url) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) await new Promise(r => setTimeout(r, attempt * 2000));
        try {
            const res = await fetch(url, { cache: 'no-store' });
            const data = await res.json().catch(() => ({}));
            if (res.ok && !data.error) return data;
            lastErr = new Error(data.error || `HTTP ${res.status}`);
            if (res.status >= 400 && res.status < 500 && res.status !== 429) break;
        } catch (e) { lastErr = e; }
    }
    throw lastErr;
}

// Cada petición lleva un número: si mientras tanto se pide otra ciudad, la
// respuesta vieja se descarta en vez de pisar a la nueva.
let weatherReqSeq = 0;
// Último tiempo guardado de ese sitio (null si no hay o es de otro sitio)
function readSavedWeather(id) {
    try {
        const saved = JSON.parse(localStorage.getItem('aeris_offline_data') || 'null');
        return saved && saved.id === id && saved.data ? saved : null;
    } catch (e) { return null; }
}

let weatherRetryTimer = null;
let shownWeatherId = null;

async function getWeather(id) {
    const reqId = ++weatherReqSeq;
    clearTimeout(weatherRetryTimer);
    weatherRetryTimer = null;
    let storedName = localStorage.getItem('lastName');
    const badNames = ['Ubicación', 'Ubicacion', 'Tu ubicación', 'Tu ubicacion', 'Ubicación detectada', ''];
    if (badNames.includes(storedName)) storedName = null;
    const storedRegion = localStorage.getItem('lastRegion') || '';
    let url = `/api/weather/${id}?region=${encodeURIComponent(storedRegion)}`;
    if (storedName) url += `&name=${encodeURIComponent(storedName)}`;

    let data;
    try {
        data = await fetchWeatherData(url);
    } catch (e) {
        if (reqId !== weatherReqSeq) return;
        console.error(e);
        // Se vuelve a intentar solo en un rato (o en cuanto vuelva la red)
        weatherRetryTimer = setTimeout(() => getWeather(id), 30000);
        // Si ya se ve el tiempo de este sitio, se deja tal cual: sin avisos
        if (shownWeatherId === id) return;
        const saved = readSavedWeather(id);
        if (saved) {
            renderWeather(saved.data);
            shownWeatherId = id;
            return;
        }
        document.querySelectorAll('.skeleton').forEach(el => el.classList.remove('skeleton'));
        const errorBanner = document.getElementById('error-banner');
        if (errorBanner) errorBanner.style.display = 'flex';
        hideSplash();
        return;
    }
    if (reqId !== weatherReqSeq) return;
    document.getElementById('error-banner').style.display = 'none';
    try { localStorage.setItem('aeris_offline_data', JSON.stringify({ id, data, timestamp: Date.now() })); } catch (e) {}
    lastFetchAt = Date.now();
    shownWeatherId = id;
    renderWeather(data);
    if (notifPermission() === 'granted') registerPush(true);
}

// Al recuperar la red, si había un reintento pendiente se hace ya
window.addEventListener('online', () => {
    if (weatherRetryTimer) getWeather(currentId);
});

// Localizar: icono girando mientras el GPS responde; si falla, se
// restaura lo que había en vez de dejar los esqueletos para siempre.
function locateUser(timeout, onFail) {
    const btn = document.getElementById('geoBtn');
    if (btn) btn.classList.add('is-loading');
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            if (btn) btn.classList.remove('is-loading');
            const id = `${pos.coords.latitude},${pos.coords.longitude}`;
            localStorage.setItem('lastId', id); localStorage.setItem('lastName', ''); localStorage.setItem('lastRegion', '');
            currentId = id;
            currentCityInfo = { id, name: '', region: '', lat: pos.coords.latitude, lon: pos.coords.longitude };
            getWeather(id);
        },
        () => { if (btn) btn.classList.remove('is-loading'); onFail(); },
        { timeout, enableHighAccuracy: false }
    );
}

// ============================================================
// 29. GEOLOCALIZACIÓN
// ============================================================
const geoBtn = document.getElementById('geoBtn');
if (geoBtn) {
    geoBtn.addEventListener('click', () => {
        if (!navigator.geolocation) return;
        document.querySelectorAll('#city, #desc, #temp').forEach(el => el.classList.add('skeleton'));
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        locateUser(8000, () => {
            if (window._lastFullData) renderWeather(window._lastFullData);
            else document.querySelectorAll('#city, #desc, #temp').forEach(el => el.classList.remove('skeleton'));
        });
    });
}

// ============================================================
// 30. ONBOARDING
// ============================================================
// Lo que tiene que esperar a que se cierre la bienvenida (p. ej. pedir avisos)
let onboardingOpen = false;
const afterOnboardingQueue = [];
const afterOnboarding = (fn) => { if (onboardingOpen) afterOnboardingQueue.push(fn); else fn(); };

function initOnboarding() {
    if (localStorage.getItem('aeris_onboarding_done')) return;
    const overlay = document.getElementById('onboarding-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    onboardingOpen = true;
    lockScroll(true);
    let slide = 0;
    const slides = document.querySelectorAll('.onboarding-slide');
    const dots   = document.querySelectorAll('.ob-dot');
    const next   = document.getElementById('ob-next');
    const skip   = document.getElementById('ob-skip');

    const goTo = (n) => {
        slides.forEach((s, i) => s.classList.toggle('active', i === n));
        dots.forEach((d, i) => d.classList.toggle('active', i === n));
        slide = n;
        next.textContent = n === slides.length - 1 ? '¡Empezar! 🚀' : 'Siguiente →';
    };

    const finish = () => {
        localStorage.setItem('aeris_onboarding_done', '1');
        overlay.classList.add('is-leaving');
        lockScroll(false);
        onboardingOpen = false;
        afterOnboardingQueue.splice(0).forEach(fn => fn());
        setTimeout(() => { overlay.style.display = 'none'; overlay.classList.remove('is-leaving'); }, 230);
    };
    next.addEventListener('click', () => {
        if (slide < slides.length - 1) goTo(slide + 1);
        else finish();
    });
    skip.addEventListener('click', finish);
    goTo(0);
}

// ============================================================
// 31. CARGA INICIAL
// ============================================================
window.addEventListener('load', () => {
    // Splash: se oculta al pintar los datos; esto es solo la red de seguridad
    setTimeout(hideSplash, 4000);

    // Modal notificaciones: solo si el navegador puede recibirlas y el
    // servidor puede enviarlas (no pedimos un permiso que no sirve de nada)
    // Sale un poco después de quitarse el splash, y si está la bienvenida
    // abierta, al cerrarla (antes salían las dos a la vez, una encima de otra).
    if (pushSupported() && notifPermission() === 'default') {
        setTimeout(async () => {
            if (!(await getVapidKey())) return;
            afterOnboarding(() => setTimeout(openNotifModal, 600));
        }, SPLASH_MIN_MS + 1500);
    }

    renderFavorites();
    updateUnitsUI();
    updateBellUI();

    // Geolocalización automática: SOLO en la primerísima visita real
    // (sin ciudad guardada de antes y sin venir de un enlace compartido).
    // En cargas posteriores respetamos la última ciudad vista/favorita;
    // el botón de geolocalización manual sigue disponible para actualizar.
    const shouldAutoGeolocate = !hadStoredCity && !cameFromSharedLink && !!navigator.geolocation;
    // Si hay datos recientes guardados de este sitio se pintan ya, sin esperar
    // a la red con el splash delante; lo que llegue después los actualiza
    // (y solo se anima lo que haya cambiado).
    const saved = shouldAutoGeolocate ? null : readSavedWeather(currentId);
    if (saved && Date.now() - saved.timestamp < 6 * 3600e3) {
        renderWeather(saved.data);
        shownWeatherId = currentId;
    }
    if (shouldAutoGeolocate) {
        locateUser(4000, () => getWeather(currentId));
    } else {
        getWeather(currentId);
    }
});

// Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js'));
}

// ============================================================
// 32. BOTTOM NAVIGATION
// ============================================================
(function initBottomNav() {
    const items    = Array.from(document.querySelectorAll('.bottom-nav-item'));
    const sections = ['capture-card', 'section-semana', 'section-ambiente', 'section-mapa'];

    // Flag para evitar que el scroll sobreescriba el tab recién pulsado
    let suppressScroll = false;
    let suppressTimer  = null;

    // Tap → scroll suave + fijar tab activo
    items.forEach(btn => {
        btn.addEventListener('click', () => {
            const el = document.getElementById(btn.dataset.target);
            if (!el) return;
            // Compensamos la barra superior fija para que la tarjeta no quede debajo
            const navH = document.querySelector('.nav-bar')?.offsetHeight || 0;
            const y = btn.dataset.target === 'capture-card' ? 0 : el.getBoundingClientRect().top + window.pageYOffset - navH - 6;
            window.scrollTo({ top: y, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
            setActive(btn.dataset.target);

            // Bloquear scroll handler mientras dura la animación suave (~600ms)
            suppressScroll = true;
            clearTimeout(suppressTimer);
            suppressTimer = setTimeout(() => { suppressScroll = false; }, 650);
        });
    });

    // Scroll manual → actualizar tab activo (solo si no hay click reciente)
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (suppressScroll || ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            const pivot = window.pageYOffset + window.innerHeight * 0.35;
            let activeId = sections[0];
            sections.forEach(id => {
                const el = document.getElementById(id);
                if (el && el.getBoundingClientRect().top + window.pageYOffset - 20 <= pivot) {
                    activeId = id;
                }
            });
            setActive(activeId);
            ticking = false;
        });
    }, { passive: true });

    // Indicador deslizante: transform directo en el elemento (no una variable
    // CSS en el padre, que recalcularía estilos de todos los hijos)
    const indicator = document.getElementById('bnavIndicator');
    function setActive(id) {
        let idx = 0;
        items.forEach((b, i) => {
            const on = b.dataset.target === id;
            b.classList.toggle('active', on);
            if (on) { idx = i; b.setAttribute('aria-current', 'true'); } else b.removeAttribute('aria-current');
        });
        if (indicator) indicator.style.transform = `translateX(${idx * 100}%)`;
    }

    // Desenfoque bajo la barra superior solo cuando hay contenido debajo
    const onScrollEdge = () => document.body.classList.toggle('is-scrolled', window.scrollY > 6);
    window.addEventListener('scroll', onScrollEdge, { passive: true });
    onScrollEdge();
})();
