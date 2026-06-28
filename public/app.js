/* ============================================================
   AERIS WEATHER — app.js
   ============================================================ */

// ============================================================
// 1. PWA INSTALL (versión consolidada, sin duplicados)
// ============================================================
(function () {
    const installBtn = document.getElementById('installBtn');
    const iosModal = document.getElementById('iosInstallModal');

    function updateInstallModal() {
        const ua = (navigator.userAgent || navigator.vendor || window.opera).toLowerCase();
        const isTrap = ua.includes('tiktok') || ua.includes('bytedance') || ua.includes('instagram') || ua.includes('musical_ly');
        const safariDiv = document.getElementById('safari-instructions');
        const tiktokDiv = document.getElementById('tiktok-instructions');
        if (isTrap) {
            if (safariDiv) safariDiv.style.display = 'none';
            if (tiktokDiv) tiktokDiv.style.display = 'block';
        } else {
            if (safariDiv) safariDiv.style.display = 'block';
            if (tiktokDiv) tiktokDiv.style.display = 'none';
        }
    }

    window.addEventListener('load', () => {
        updateInstallModal();
        setTimeout(updateInstallModal, 300);
        setTimeout(updateInstallModal, 1000);
    });

    window.closeIosModal = () => { if (iosModal) iosModal.style.display = 'none'; };

    const isIos = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
    const isInStandaloneMode = ('standalone' in navigator) && navigator.standalone;

    if (isIos && !isInStandaloneMode && installBtn) {
        installBtn.style.display = 'flex';
        installBtn.addEventListener('click', () => {
            updateInstallModal();
            if (iosModal) iosModal.style.display = 'flex';
        });
    }

    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (installBtn) {
            installBtn.style.display = 'flex';
            installBtn.onclick = async () => {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    const { outcome } = await deferredPrompt.userChoice;
                    if (outcome === 'accepted') installBtn.style.display = 'none';
                    deferredPrompt = null;
                } else {
                    updateInstallModal();
                    if (iosModal) iosModal.style.display = 'flex';
                }
            };
        }
    });

    window.addEventListener('appinstalled', () => {
        if (installBtn) installBtn.style.display = 'none';
    });
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
let currentId = localStorage.getItem('lastId') || 'Madrid';
let currentCityName = localStorage.getItem('lastName') || 'Madrid';
let currentCityRegion = localStorage.getItem('lastRegion') || '';
let currentCityInfo = { id: currentId, name: currentCityName, region: currentCityRegion, lat: null, lon: null };
let favorites = JSON.parse(localStorage.getItem('aeris_favs')) || [];
let rainChartInstance = null;
let lastWeatherData = null;
let currentPersona = localStorage.getItem('aeris_persona') || 'normal';

window.retryWeather = () => {
    document.getElementById('error-banner').style.display = 'none';
    getWeather(currentId);
};

// ============================================================
// 4. HISTORIAL DE BÚSQUEDAS
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
    const suggestionsList = document.getElementById('suggestions');
    suggestionsList.innerHTML =
        '<li class="history-header text-uppercase fw-bold">Recientes</li>' +
        history.map(c => `
            <li class="suggestion-item" data-city='${JSON.stringify(c)}'>
                <span><i class="bi bi-clock-history me-2 opacity-50" style="font-size:0.8rem"></i>${c.name}</span>
                <small>${c.region}</small>
            </li>`).join('');
    suggestionsList.querySelectorAll('.suggestion-item').forEach(li => {
        li.addEventListener('click', () => {
            const city = JSON.parse(li.dataset.city);
            selectCity(city);
        });
    });
    suggestionsList.classList.add('show');
};

// ============================================================
// 5. UTILIDADES
// ============================================================
const renderIcon = (iconName, size = "fs-4") => {
    if (iconName.includes('bi-cloud-sun') && !iconName.includes('moon')) {
        let imgWidth = "48px";
        let animation = "";
        if (size.includes("5.5rem") || size.includes("fs-1")) {
            imgWidth = "160px";
            animation = "animation: float 3s infinite ease-in-out;";
        }
        return `<img src="icono-clima.png" alt="Sol y Nube" style="width: ${imgWidth}; height: auto; vertical-align: middle; ${animation}">`;
    }
    if (iconName.includes('moon')) {
        return `<i class="bi ${iconName} ${size}" style="color: #64748b !important; filter: drop-shadow(0 0 5px rgba(100,116,139,0.3));"></i>`;
    }
    return `<i class="bi ${iconName} ${size}"></i>`;
};

const normalizeInput = (str) => str.normalize("NFD").replace(/[̀-ͯ]/g, "");

const setDynamicBackground = (cur) => {
    document.body.className = '';
    const isDay = cur.isDay;
    const code = cur.desc.toLowerCase();
    const temp = cur.temp;
    if (temp > 35) { document.body.classList.add('bg-hot'); return; }
    if (code.includes('lluvia') || code.includes('llovizna') || code.includes('tormenta') || code.includes('chubascos')) { document.body.classList.add('bg-rain'); return; }
    if (code.includes('nieve')) { document.body.classList.add('bg-snow'); return; }
    if (code.includes('nublado') || code.includes('nubes') || code.includes('cubierto') || code.includes('niebla')) { document.body.classList.add(isDay ? 'bg-cloudy-day' : 'bg-cloudy-night'); return; }
    document.body.classList.add(isDay ? 'bg-clear-day' : 'bg-clear-night');
};

// ============================================================
// 6. AI TIPS E OUTFIT
// ============================================================
const updateAIText = (cur, highPollen = false) => {
    if (!cur) return;
    const p = aiLogic[currentPersona];
    document.getElementById('tip-icon').innerText = p.icon;

    let key = 'nice';
    const d = cur.desc.toLowerCase();
    const t = cur.temp;
    const w = cur.windSpeed;

    if (highPollen) { key = 'allergy'; }
    else if (d.includes('nieve') || d.includes('nevada') || d.includes('granizo') || d.includes('aguanieve')) { key = 'snow'; }
    else if (d.includes('tormenta') || d.includes('trueno') || d.includes('lluvia') || d.includes('llovizna') || d.includes('chubasco')) { key = 'rain'; }
    else if (w > 25) { key = 'wind'; }
    else if (t > 28) { key = 'hot'; }
    else if (t < 12) { key = 'cold'; }
    else if (d.includes('nublado') || d.includes('cubierto') || d.includes('nubes') || d.includes('niebla')) { key = 'cloudy'; }

    const frases = p.tips[key] || p.tips['nice'];
    document.getElementById('tip-text').innerText = frases[Math.floor(Math.random() * frases.length)];

    const clothes = getClothingList(cur.temp, cur.desc, cur.windSpeed, cur.uv);
    const clothingContainer = document.getElementById('clothing-advice');
    if (clothingContainer) {
        let html = `<div class="w-100 mb-2"><small class="text-uppercase fw-bold opacity-50" style="font-size:0.65rem;">ELLOS 👦</small><div class="d-flex flex-wrap gap-2">` +
            clothes.boys.map(i => `<a href="${i.url}" target="_blank" rel="noopener" class="clothing-tag boy"><i class="bi ${i.icon}"></i> ${i.text} <i class="bi bi-box-arrow-up-right" style="font-size:0.7em;opacity:0.6;margin-left:2px"></i></a>`).join('') +
            `</div></div><div class="w-100"><small class="text-uppercase fw-bold opacity-50" style="font-size:0.65rem;">ELLAS 👧</small><div class="d-flex flex-wrap gap-2">` +
            clothes.girls.map(i => `<a href="${i.url}" target="_blank" rel="noopener" class="clothing-tag girl"><i class="bi ${i.icon}"></i> ${i.text} <i class="bi bi-box-arrow-up-right" style="font-size:0.7em;opacity:0.6;margin-left:2px"></i></a>`).join('') +
            `</div></div>`;
        if (clothes.shopLink) {
            html += `<div class="mt-2 w-100"><a href="${clothes.shopLink.url}" target="_blank" rel="noopener" class="shop-btn w-100 justify-content-center"><i class="bi ${clothes.shopLink.icon}"></i> ${clothes.shopLink.text}</a></div>`;
        }
        clothingContainer.innerHTML = html;
    }
};

const getClothingList = (temp, desc, wind, uv) => {
    const tag = "&tag=cristianort01-21";
    const base = "https://www.amazon.es/s?k=";
    const item = (icon, text, search) => ({ icon, text, url: `${base}${search.replace(/ /g, '+')}${tag}` });

    let boys = [], girls = [], shopLink = null;
    desc = desc.toLowerCase();
    const isRain = desc.includes('lluvia') || desc.includes('llovizna') || desc.includes('tormenta');
    const isSnow = desc.includes('nieve') || desc.includes('nevada');
    const isClear = desc.includes('despejado') || desc.includes('sol');

    if (temp >= 30)      { boys.push(item('bi-brightness-high','Tirantes','camiseta tirantes hombre')); girls.push(item('bi-brightness-high','Top/Vestido','vestido verano mujer fresco')); boys.push(item('bi-emoji-sunglasses','Shorts','pantalones cortos hombre deporte')); girls.push(item('bi-emoji-sunglasses','Shorts','shorts mujer verano')); boys.push(item('bi-fan','Abanico','abanico mano')); girls.push(item('bi-fan','Abanico','abanico moderno')); }
    else if (temp >= 25) { boys.push(item('bi-tshirt','Camiseta','camiseta algodon hombre')); girls.push(item('bi-tshirt','Blusa','blusa fresca mujer')); boys.push(item('bi-emoji-smile','Chino corto','pantalon chino corto hombre')); girls.push(item('bi-emoji-smile','Falda','falda verano mujer')); }
    else if (temp >= 20) { boys.push(item('bi-tshirt','Polo','polo manga corta hombre')); girls.push(item('bi-tshirt','Camiseta','camiseta moda mujer')); boys.push(item('bi-person','Jeans','vaqueros hombre levis')); girls.push(item('bi-person','Culotte','pantalon culotte mujer')); }
    else if (temp >= 15) { boys.push(item('bi-person','Camisa','camisa casual hombre')); girls.push(item('bi-person','Cardigan','cardigan mujer fino')); boys.push(item('bi-person','Chinos','pantalones chinos hombre')); girls.push(item('bi-person','Jeans','jeans mujer')); boys.push(item('bi-layers','Chaleco','chaleco ligero hombre')); girls.push(item('bi-layers','Blazer','blazer mujer casual')); }
    else if (temp >= 10) { boys.push(item('bi-person-hoodie','Sudadera','sudadera con capucha hombre')); girls.push(item('bi-person-hoodie','Jersey','jersey punto mujer')); boys.push(item('bi-layers','Cazadora','cazadora bomber hombre')); girls.push(item('bi-layers','Trench','gabardina mujer')); }
    else if (temp >= 5)  { boys.push(item('bi-person-fill','Jersey Lana','jersey lana hombre')); girls.push(item('bi-person-fill','Jersey Grueso','jersey grueso mujer invierno')); boys.push(item('bi-bricks','Abrigo','abrigo paño hombre')); girls.push(item('bi-bricks','Abrigo','abrigo lana mujer')); }
    else                 { boys.push(item('bi-snow2','Térmica','camiseta termica hombre')); girls.push(item('bi-snow2','Térmica','camiseta termica mujer')); boys.push(item('bi-person-fill','Plumífero','chaqueta plumas hombre')); girls.push(item('bi-person-fill','Plumífero','abrigo acolchado mujer')); }

    if (temp < 10 || (wind > 20 && temp < 15)) { boys.push(item('bi-emoji-dizzy','Bufanda','bufanda hombre invierno')); girls.push(item('bi-emoji-dizzy','Bufanda','bufanda mujer suave')); }
    if (temp < 5)  { boys.push(item('fas fa-hat-winter','Gorro','gorro lana hombre')); girls.push(item('fas fa-hat-winter','Gorro','gorro invierno mujer pompon')); }
    if (isRain)    { boys.push(item('bi-umbrella','Paraguas','paraguas resistente viento')); girls.push(item('bi-umbrella','Paraguas','paraguas plegable mujer')); boys.push(item('bi-cloud-rain','Impermeable','chubasquero hombre')); girls.push(item('bi-cloud-rain','Gabardina','chubasquero mujer impermeable')); if (temp < 15) { boys.push(item('bi-boot','Botas Agua','botas de agua hombre')); girls.push(item('bi-boot','Botas Agua','botas de agua mujer hunter')); } }
    if (isSnow)    { boys.push(item('bi-snow','Botas Nieve','botas nieve hombre impermeables')); girls.push(item('bi-snow','Botas Nieve','botas nieve mujer pelo')); boys.push(item('bi-hand-index-thumb','Guantes','guantes nieve hombre tactiles')); girls.push(item('bi-hand-index-thumb','Guantes','guantes invierno mujer')); }
    if (uv > 5 && isClear) { boys.push(item('bi-sunglasses','Gafas Sol','gafas de sol polarizadas hombre')); girls.push(item('bi-sunglasses','Gafas Sol','gafas de sol mujer tendencia')); boys.push(item('bi-capslock','Gorra','gorra beisbol hombre')); girls.push(item('bi-capslock','Sombrero','sombrero paja mujer')); }

    if (isRain)    shopLink = { text: "¡Ojo! Paraguas anti-viento", url: `${base}paraguas+antiviento+fuerte${tag}`, icon: "bi-umbrella-fill" };
    else if (isSnow) shopLink = { text: "Cadenas para el coche", url: `${base}cadenas+nieve+coche+textil${tag}`, icon: "bi-snow2" };
    else if (uv > 7)   shopLink = { text: "Crema Solar Facial 50+", url: `${base}crema+solar+facial+50+isdin${tag}`, icon: "bi-sun-fill" };
    else if (temp > 32) shopLink = { text: "Ventilador de Cuello", url: `${base}ventilador+cuello+portatil${tag}`, icon: "bi-fan" };
    else if (temp < 4)  shopLink = { text: "Calentadores de Manos USB", url: `${base}calentador+manos+usb${tag}`, icon: "bi-fire" };
    else shopLink = { text: "🔥 Ofertas Flash (Hasta -50%)", url: `${base}ofertas+amazon+hoy${tag}`, icon: "bi-lightning-charge-fill" };

    return { boys: boys.slice(0, 5), girls: girls.slice(0, 5), shopLink };
};

// ============================================================
// 7. PERSONA MODAL
// ============================================================
const modal = document.getElementById('personaModal');
const personaGrid = document.getElementById('personaGrid');

const openPersonaModal = () => {
    personaGrid.innerHTML = '';
    Object.keys(aiLogic).forEach(key => {
        const p = aiLogic[key];
        const div = document.createElement('div');
        div.className = `persona-option ${key === currentPersona ? 'active' : ''}`;
        div.onclick = () => { currentPersona = key; localStorage.setItem('aeris_persona', key); modal.classList.remove('show'); if (lastWeatherData) updateAIText(lastWeatherData); };
        div.innerHTML = `<span class="persona-icon">${p.icon}</span><span class="persona-name">${p.name}</span>`;
        personaGrid.appendChild(div);
    });
    modal.classList.add('show');
};

document.getElementById('ai-toggle').addEventListener('click', openPersonaModal);
document.getElementById('closePersonaModal').addEventListener('click', () => modal.classList.remove('show'));
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('show'); });

// ============================================================
// 8. TEMA (claro/oscuro)
// ============================================================
const themeBtn = document.getElementById('themeBtn');
const applyTheme = (theme) => {
    document.body.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-bs-theme', theme);
    if (themeBtn) {
        themeBtn.innerHTML = theme === 'dark'
            ? '<i class="bi bi-sun-fill fs-5"></i>'
            : '<i class="bi bi-moon-stars-fill fs-5"></i>';
    }
    document.documentElement.style.setProperty('--invert-close', theme === 'dark' ? '1' : '0');
};

if (themeBtn) {
    themeBtn.addEventListener('click', () => {
        const current = document.body.getAttribute('data-theme') || 'light';
        const newTheme = current === 'dark' ? 'light' : 'dark';
        localStorage.setItem('aeris_theme_pref', newTheme);
        applyTheme(newTheme);
    });
}

// ============================================================
// 9. FAVORITOS
// ============================================================
const updateHeartUI = () => {
    const heart = document.getElementById('favHeart');
    if (!heart) return;
    const exists = favorites.some(f => String(f.id) === String(currentCityInfo.id));
    heart.className = exists ? 'bi bi-heart-fill fs-3 text-danger' : 'bi bi-heart fs-3';
};

const toggleFavorite = () => {
    const index = favorites.findIndex(f => String(f.id) === String(currentCityInfo.id));
    if (index > -1) favorites.splice(index, 1);
    else favorites.push({ ...currentCityInfo });
    localStorage.setItem('aeris_favs', JSON.stringify(favorites));
    updateHeartUI();
    renderFavorites();
};

const renderFavorites = () => {
    const list = document.getElementById('favList');
    if (!list) return;
    list.innerHTML = '';
    favorites.forEach(city => {
        const li = document.createElement('li');
        li.className = 'fav-item';
        li.innerHTML = `<div class="fav-item-info"><span class="fav-name">${city.name}</span><span class="fav-region">${city.region}</span></div><div class="fav-delete" aria-label="Eliminar favorito"><i class="bi bi-trash3-fill"></i></div>`;
        li.querySelector('.fav-item-info').onclick = () => { closeSidebar(); selectCity(city); };
        li.querySelector('.fav-delete').onclick = (e) => {
            e.stopPropagation();
            favorites = favorites.filter(f => String(f.id) !== String(city.id));
            localStorage.setItem('aeris_favs', JSON.stringify(favorites));
            renderFavorites();
            updateHeartUI();
        };
        list.appendChild(li);
    });
};

const openSidebar = () => { document.getElementById('favSidebar').classList.add('open'); document.getElementById('overlay').classList.add('show'); renderFavorites(); };
const closeSidebar = () => { document.getElementById('favSidebar').classList.remove('open'); document.getElementById('overlay').classList.remove('show'); };

document.getElementById('favMenuBtn').addEventListener('click', openSidebar);
document.getElementById('closeSidebar').addEventListener('click', closeSidebar);
document.getElementById('overlay').addEventListener('click', closeSidebar);
document.getElementById('favHeart').addEventListener('click', toggleFavorite);

// ============================================================
// 10. BÚSQUEDA CON HISTORIAL
// ============================================================
const searchInput = document.getElementById('citySearch');
const suggestionsList = document.getElementById('suggestions');
let searchTimeout;

if (searchInput) {
    searchInput.addEventListener('focus', () => {
        if (searchInput.value.length < 3) showSearchHistory();
    });

    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        if (e.target.value.length < 3) {
            showSearchHistory();
            return;
        }
        searchTimeout = setTimeout(async () => {
            try {
                const cleanQuery = normalizeInput(e.target.value);
                const res = await fetch(`/api/search/${encodeURIComponent(cleanQuery)}`);
                const cities = await res.json();
                suggestionsList.innerHTML = '';
                cities.forEach(c => {
                    const li = document.createElement('li');
                    li.className = 'suggestion-item';
                    li.innerHTML = `<span>${c.name}</span><small>${c.region}</small>`;
                    li.onclick = () => selectCity(c);
                    suggestionsList.appendChild(li);
                });
                if (cities.length) suggestionsList.classList.add('show');
                else suggestionsList.classList.remove('show');
            } catch (e) { }
        }, 300);
    });

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !suggestionsList.contains(e.target)) {
            suggestionsList.classList.remove('show');
        }
    });
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
    document.querySelectorAll('.glass-card h5, .glass-card .h4, .temp-big, #tip-text').forEach(el => {
        el.classList.add('skeleton');
        el.style.removeProperty('height');
    });
    getWeather(id);
};

// ============================================================
// 11. COMPARTIR
// ============================================================
document.getElementById('shareBtn').addEventListener('click', () => {
    const element = document.getElementById('capture-card');
    const btn = document.getElementById('shareBtn');
    btn.style.display = 'none';
    html2canvas(element, { backgroundColor: null, scale: 2 }).then(canvas => {
        btn.style.display = 'flex';
        const link = document.createElement('a');
        link.download = `aeris.png`;
        link.href = canvas.toDataURL();
        link.click();
    }).catch(() => { btn.style.display = 'flex'; });
});

// ============================================================
// 12. GRÁFICO DE LLUVIA
// ============================================================
const renderRainChart = (nowcast, hourlyData, currentTime) => {
    const card = document.getElementById('rain-card');
    const summary = document.getElementById('rain-summary');
    let timeLabels = [], precipData = [];

    if (nowcast && nowcast.time && nowcast.time.length > 0) {
        let startIndex = 0;
        if (currentTime) {
            const targetTime = new Date(currentTime).getTime();
            startIndex = nowcast.time.findIndex(t => new Date(t).getTime() >= targetTime);
        }
        if (startIndex === -1 || startIndex >= nowcast.time.length) startIndex = 0;
        for (let i = 0; i < 6; i++) {
            if (startIndex + i < nowcast.precipitation.length) {
                precipData.push(nowcast.precipitation[startIndex + i]);
                timeLabels.push(nowcast.time[startIndex + i].split('T')[1]);
            }
        }
    }

    const totalRadar = precipData.reduce((a, b) => a + b, 0);
    if (totalRadar === 0 && hourlyData) {
        precipData = []; timeLabels = [];
        for (let i = 0; i < 5; i++) {
            if (hourlyData[i]) {
                precipData.push(hourlyData[i].precip || 0);
                timeLabels.push(hourlyData[i].displayTime);
            }
        }
    }

    const total = precipData.reduce((a, b) => a + b, 0);
    if (total < 0.1) { card.style.display = 'none'; return; }

    card.style.display = 'block';
    summary.innerText = total > 5 ? "Lluvia Fuerte" : (total > 1 ? "Lluvia Moderada" : "Lluvia Ligera");

    const ctx = document.getElementById('rainChart').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 150);
    gradient.addColorStop(0, 'rgba(56,189,248,0.8)');
    gradient.addColorStop(1, 'rgba(56,189,248,0.05)');
    if (rainChartInstance) rainChartInstance.destroy();
    rainChartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: timeLabels, datasets: [{ label: 'mm', data: precipData, backgroundColor: gradient, borderColor: '#38bdf8', borderWidth: 2, pointRadius: 3, fill: true, tension: 0.4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { display: false, min: 0 } }, animation: { duration: 1000 }, layout: { padding: { top: 10, left: 5, right: 5, bottom: 0 } } }
    });
};

// ============================================================
// 13. RENDERIZADO: POLLEN, ALERTAS, LIFESTYLE
// ============================================================
const renderPollen = (pollen) => {
    const card = document.getElementById('pollen-card');
    const list = document.getElementById('pollen-list');
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
    list.innerHTML = activeTypes.map(t => {
        const val = pollen[t.k] || 0;
        let percent = Math.min((val / 100) * 100, 100);
        if (val > 50) isHigh = true;
        return `<div class="pollen-item">
            <span class="pollen-name text-capitalize opacity-75">${t.n}</span>
            <div class="pollen-bar-bg"><div class="pollen-bar-fill" style="width:${percent}%;background-color:${t.color}"></div></div>
            <span class="pollen-val opacity-50">${val}</span>
        </div>`;
    }).join('');
    return isHigh;
};

const renderAlerts = (alerts) => {
    const container = document.getElementById('alerts-container');
    if (!alerts || alerts.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = alerts.map(a => `
        <div class="alert-card ${a.level}">
            <i class="bi bi-exclamation-triangle-fill alert-icon"></i>
            <div><div class="fw-bold">${a.title}</div><div class="small opacity-75">${a.msg}</div></div>
        </div>`).join('');
};

const renderLifestyle = (cur, daily) => {
    const list = document.getElementById('lifestyle-list');
    if (!list || !daily) return;
    const desc = cur.desc.toLowerCase();
    const isRain = desc.includes('lluvia') || desc.includes('llovizna') || desc.includes('tormenta') || desc.includes('chubasco');
    const isSnow = desc.includes('nieve') || desc.includes('aguanieve') || desc.includes('granizo');
    const isFog = desc.includes('niebla') || desc.includes('bruma');
    const isStorm = desc.includes('tormenta') || desc.includes('trueno');
    const probToday = daily[0] ? (daily[0].rainProbMax || 0) : 0;
    const probTomorrow = daily[1] ? (daily[1].rainProbMax || 0) : 0;

    const activities = [
        { id: 'run',   name: 'Running',      icon: 'fa-solid fa-person-running',  check: () => { if (isRain || isSnow || cur.temp > 32 || cur.temp < -5 || cur.windSpeed > 35) return 'bad'; if (probToday > 50 || cur.temp > 26 || cur.temp < 5 || cur.windSpeed > 20) return 'fair'; return 'good'; } },
        { id: 'cycle', name: 'Ciclismo',     icon: 'fa-solid fa-bicycle',         check: () => { if (isRain || isSnow || cur.windSpeed > 30 || cur.temp > 35) return 'bad'; if (cur.windSpeed > 15 || cur.temp < 5 || cur.temp > 28) return 'fair'; return 'good'; } },
        { id: 'bbq',   name: 'Barbacoa',     icon: 'fa-solid fa-burger',          check: () => { if (isRain || isSnow || probToday > 30 || cur.windSpeed > 25) return 'bad'; if (cur.temp < 15 || probToday > 10 || cur.windSpeed > 15) return 'fair'; return 'good'; } },
        { id: 'car',   name: 'Lavar Coche',  icon: 'fa-solid fa-car-side',        check: () => { if (isRain || isSnow || probToday >= 10 || probTomorrow >= 10) return 'bad'; if (cur.temp < 4 || probToday > 0 || probTomorrow > 0) return 'fair'; return 'good'; } },
        { id: 'star',  name: 'Ver Estrellas',icon: 'fa-solid fa-star',            check: () => { if (cur.isDay || cur.cloudCover > 50 || isRain || isSnow) return 'bad'; if (cur.cloudCover > 20) return 'fair'; return 'good'; } },
        { id: 'dog',   name: 'Paseo Perro',  icon: 'fa-solid fa-dog',             check: () => { if (isStorm || isRain || cur.temp > 30 || cur.temp < -10) return 'bad'; if (probToday > 50 || cur.temp > 25 || cur.temp < 5) return 'fair'; return 'good'; } },
        { id: 'beach', name: 'Playa',        icon: 'fa-solid fa-umbrella-beach',  check: () => { if (isRain || cur.temp < 22 || cur.windSpeed > 25) return 'bad'; if (cur.cloudCover > 60 || cur.windSpeed > 15 || cur.temp < 25) return 'fair'; return 'good'; } },
        { id: 'drive', name: 'Conducir',     icon: 'fa-solid fa-road',            check: () => { if (isFog || isSnow || isStorm || cur.windSpeed > 50) return 'bad'; if (isRain || cur.windSpeed > 30 || probToday > 60) return 'fair'; return 'good'; } }
    ];

    list.innerHTML = activities.map(act => {
        const status = act.check();
        return `<div class="activity-item" role="img" aria-label="${act.name}: ${status === 'good' ? 'Ideal' : status === 'fair' ? 'Regular' : 'Malo'}">
            <i class="${act.icon} activity-icon"></i>
            <div class="status-dot status-${status}"></div>
            <span class="activity-name">${act.name}</span>
        </div>`;
    }).join('');
};

// ============================================================
// 14. toggleDay (global, usado en onclick del HTML dinámico)
// ============================================================
window.toggleDay = (index) => {
    const el = document.getElementById(`day-detail-${index}`);
    if (el) {
        if (el.style.display === 'none') {
            el.style.display = 'block';
            el.style.opacity = '0';
            setTimeout(() => el.style.opacity = '1', 10);
        } else {
            el.style.opacity = '0';
            setTimeout(() => el.style.display = 'none', 300);
        }
    }
};

// ============================================================
// 15. PUSH NOTIFICATIONS
// ============================================================
async function registerPush(silent = false) {
    if (!('serviceWorker' in navigator)) return;
    if (silent && Notification.permission !== 'granted') return;
    const register = await navigator.serviceWorker.ready;
    let subscription = await register.pushManager.getSubscription();
    if (!subscription) {
        try {
            const response = await fetch('/api/vapid-key');
            if (!response.ok) return; // VAPID no configurado
            const { key } = await response.json();
            const urlBase64ToUint8Array = (base64String) => {
                const padding = '='.repeat((4 - base64String.length % 4) % 4);
                const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
                const rawData = window.atob(base64);
                const outputArray = new Uint8Array(rawData.length);
                for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
                return outputArray;
            };
            subscription = await register.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
        } catch (e) { return; }
    }
    const lat = currentCityInfo.lat || parseFloat(String(currentCityInfo.id).split(',')[0]);
    const lon = currentCityInfo.lon || parseFloat(String(currentCityInfo.id).split(',')[1]);
    if (!lat || !lon) return;
    await fetch('/api/subscribe', {
        method: 'POST',
        body: JSON.stringify({ subscription, lat, lon, city: currentCityInfo.name }),
        headers: { 'Content-Type': 'application/json' }
    });
    if (!silent) alert(`🔔 ¡Activado! Te avisaremos si hay lluvia, tormenta o calor extremo en ${currentCityInfo.name}.`);
}

// ============================================================
// 16. RENDERIZADO PRINCIPAL DEL TIEMPO
// ============================================================
const renderWeather = (data, isOffline = false) => {
    const cur = data.current;
    const loc = data.location;

    currentCityInfo = { id: currentId, name: loc.name, region: loc.region, lat: loc.lat, lon: loc.lon };
    lastWeatherData = cur;
    updateHeartUI();

    document.querySelectorAll('.skeleton').forEach(el => { el.classList.remove('skeleton'); el.style.width = ''; el.style.height = ''; el.style.minHeight = ''; });

    // Nombre de ciudad
    let displayCity = loc.name;
    const cityEl = document.getElementById('city');
    if (displayCity && displayCity.startsWith("Tu ubicacion (")) {
        // Normalizar (el backend puede devolver sin acento)
        displayCity = displayCity.replace("Tu ubicacion", "Tu ubicación");
    }
    if (displayCity && displayCity.startsWith("Tu ubicación")) {
        const match = displayCity.match(/\(([^)]+)\)/);
        const subText = match ? match[1] : "";
        cityEl.innerHTML = `TU UBICACIÓN ${subText ? `<small style="display:block;opacity:0.6;font-size:1em;text-transform:none;margin-top:5px">(${subText})</small>` : ''}`;
    } else {
        cityEl.innerText = displayCity || 'AERIS';
    }

    document.getElementById('temp').innerText = cur.temp + '°';
    document.getElementById('desc').innerText = cur.desc;
    document.getElementById('hum').innerText = cur.humidity;
    document.getElementById('wind').innerText = cur.windSpeed;
    document.getElementById('wind-dir').innerText = cur.windDir ? cur.windDir : '';
    document.getElementById('uv').innerText = cur.uv;
    document.getElementById('feels-like').innerText = cur.feelsLike;
    document.getElementById('compare-txt').innerText = cur.comparison || "";

    // Presión
    const pressureEl = document.getElementById('pressure');
    if (pressureEl) pressureEl.innerText = cur.pressure || '--';

    // Icono grande
    const renderedIcon = renderIcon(cur.icon, "5.5rem");
    if (renderedIcon.includes('<img')) {
        document.getElementById('weather-icon-container').innerHTML = renderedIcon;
    } else {
        document.getElementById('weather-icon-container').innerHTML = `<i class="bi ${cur.icon}" style="font-size:5.5rem;animation:float 3s infinite ease-in-out;"></i>`;
    }

    // AQI
    const aqi = cur.aqi || 0;
    let aqiText = "Buena"; let aqiColor = "#4ade80";
    if (aqi > 300) { aqiText = "Peligrosa"; aqiColor = "#7e22ce"; }
    else if (aqi > 200) { aqiText = "Muy Dañina"; aqiColor = "#a855f7"; }
    else if (aqi > 150) { aqiText = "Dañina"; aqiColor = "#ef4444"; }
    else if (aqi > 100) { aqiText = "Sensible"; aqiColor = "#f97316"; }
    else if (aqi > 50) { aqiText = "Moderada"; aqiColor = "#eab308"; }
    let aqiPercent = Math.min((aqi / 300) * 100, 100);
    document.getElementById('aqi-val').innerText = aqi;
    document.getElementById('aqi-text').innerText = aqiText;
    document.getElementById('aqi-text').style.color = aqiColor;
    document.getElementById('pm25').innerText = cur.pm25 !== undefined ? cur.pm25 + (typeof cur.pm25 === 'number' ? ' µg/m³' : '') : '--';
    document.getElementById('pm10').innerText = cur.pm10 !== undefined ? cur.pm10 + (typeof cur.pm10 === 'number' ? ' µg/m³' : '') : '--';
    document.getElementById('aqi-dot').style.left = `${aqiPercent}%`;

    // Temperaturas máx/mín
    if (data.daily && data.daily.length > 0) {
        document.getElementById('max-temp').innerText = data.daily[0].tempMax;
        document.getElementById('min-temp').innerText = data.daily[0].tempMin;
        document.getElementById('max-temp').classList.remove('skeleton');
        document.getElementById('min-temp').classList.remove('skeleton');
    }

    renderRainChart(data.nowcast, data.hourly, cur.time);
    const isHighPollen = renderPollen(data.pollen);
    renderLifestyle(cur, data.daily);
    renderAlerts(data.alerts);
    updateAIText(cur, isHighPollen);
    setDynamicBackground(cur);

    // Radar
    if (loc.lat && loc.lon) {
        const radarUrl = `https://embed.windy.com/embed2.html?lat=${loc.lat}&lon=${loc.lon}&detailLat=${loc.lat}&detailLon=${loc.lon}&width=650&height=450&zoom=8&level=surface&overlay=rain&product=ecmwf&menu=&message=&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=km%2Fh&metricTemp=%C2%B0C&radarRange=-1`;
        const iframe = document.getElementById('radar-frame');
        if (iframe && iframe.src !== radarUrl) iframe.src = radarUrl;
    }

    // Hourly
    const hCont = document.getElementById('hourly');
    if (hCont) hCont.innerHTML = data.hourly.map(h =>
        `<div class="hourly-item">
            <div class="small opacity-75 fw-bold mb-1">${h.displayTime}</div>
            ${renderIcon(h.icon, "fs-4")}
            <div class="fw-bold fs-5">${h.temp}°</div>
            <div class="small fw-bold" style="font-size:0.7rem;color:var(--accent)">${h.rainProb > 0 ? h.rainProb + '%' : ''}</div>
        </div>`
    ).join('');

    // Daily
    const dCont = document.getElementById('daily');
    if (dCont) dCont.innerHTML = data.daily.map((d, index) => {
        const formattedDate = new Date(d.fecha.replace(/-/g, '/')).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' });
        let hourlyHtml = '';
        if (d.dayHours && d.dayHours.length > 0) {
            hourlyHtml = d.dayHours.map(h => {
                const hour = parseInt(h.time.split(':')[0]);
                const sunriseHour = parseInt(d.sunrise.split(':')[0]);
                const sunsetHour = parseInt(d.sunset.split(':')[0]);
                let iconClass = h.icon;
                if (hour < sunriseHour || hour > sunsetHour) {
                    iconClass = iconClass.replace('bi-sun', 'bi-moon').replace('bi-cloud-sun', 'bi-cloud-moon');
                }
                return `<div class="day-hourly-item">
                    <span class="opacity-50 fw-bold">${h.time}</span>
                    ${renderIcon(iconClass, "fs-5 text-primary")}
                    <span class="fw-bold">${h.temp}°</span>
                    <small style="color:#3b82f6;font-weight:800;font-size:0.65rem">${h.rainProb > 0 ? h.rainProb + '%' : ''}</small>
                </div>`;
            }).join('');
        } else {
            hourlyHtml = '<div class="text-center w-100 opacity-50 small">No hay datos horarios</div>';
        }
        return `
        <div style="cursor:pointer" onclick="toggleDay(${index})" role="button" aria-label="Ver horas de ${formattedDate}">
            <div class="d-flex justify-content-between align-items-center py-3 border-bottom" style="border-color:var(--glass-border)!important">
                <div style="width:35%" class="fw-bold text-capitalize">
                    <div>${formattedDate}</div>
                    <div class="small opacity-50 d-flex gap-2">
                        <span><i class="bi bi-sunrise"></i> ${d.sunrise}</span>
                        <span><i class="bi bi-sunset"></i> ${d.sunset}</span>
                    </div>
                </div>
                <div class="d-flex flex-column align-items-center" style="width:25%">
                    ${renderIcon(d.icon, "fs-5")}
                    <small class="text-primary fw-bold">${d.rainProbMax > 0 ? d.rainProbMax + '%' : ''}</small>
                </div>
                <div class="text-end fw-bold" style="width:30%">
                    <span style="color:#ef4444">${d.tempMax}°</span> / <span style="color:#3b82f6">${d.tempMin}°</span>
                    <i class="bi bi-chevron-down ms-2 opacity-50 small"></i>
                </div>
            </div>
        </div>
        <div id="day-detail-${index}" class="day-detail" style="display:none;opacity:0">
            <div class="day-detail-content">${hourlyHtml}</div>
        </div>`;
    }).join('');

    // Offline banner
    const offlineBanner = document.getElementById('offline-banner');
    if (offlineBanner) offlineBanner.style.display = isOffline ? 'flex' : 'none';
    if (isOffline) {
        const offlineData = JSON.parse(localStorage.getItem('aeris_offline_data') || '{}');
        const minutesAgo = offlineData.timestamp ? Math.round((Date.now() - offlineData.timestamp) / 60000) : '?';
        const msg = document.getElementById('offline-msg');
        if (msg) msg.innerText = `Sin conexión — datos de hace ${minutesAgo} min`;
    }
};

// ============================================================
// 17. FETCH PRINCIPAL CON MODO OFFLINE
// ============================================================
async function getWeather(id) {
    document.getElementById('error-banner').style.display = 'none';
    try {
        let storedName = localStorage.getItem('lastName');
        const badNames = ['Ubicación', 'Ubicacion', 'Tu ubicación', 'Tu ubicacion', 'Ubicación detectada', ''];
        if (badNames.includes(storedName)) storedName = null;
        const storedRegion = localStorage.getItem('lastRegion') || '';

        let url = `/api/weather/${id}?region=${encodeURIComponent(storedRegion)}`;
        if (storedName) url += `&name=${encodeURIComponent(storedName)}`;

        const res = await fetch(url);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // Guardar para modo offline
        localStorage.setItem('aeris_offline_data', JSON.stringify({ data, timestamp: Date.now() }));

        renderWeather(data, false);

        if (Notification.permission === 'granted') registerPush(true);

    } catch (e) {
        console.error(e);
        // Intentar con datos offline
        const offlineRaw = localStorage.getItem('aeris_offline_data');
        if (offlineRaw) {
            const offlineData = JSON.parse(offlineRaw);
            renderWeather(offlineData.data, true);
        } else {
            // Sin datos offline: mostrar banner de error
            document.querySelectorAll('.skeleton').forEach(el => el.classList.remove('skeleton'));
            const errorBanner = document.getElementById('error-banner');
            if (errorBanner) errorBanner.style.display = 'flex';
        }
    }
}

// ============================================================
// 18. GEOLOCALIZACIÓN
// ============================================================
const geoBtn = document.getElementById('geoBtn');
if (geoBtn) {
    geoBtn.addEventListener('click', () => {
        if (!navigator.geolocation) return;
        document.querySelectorAll('.glass-card h5, .glass-card .h4, .temp-big').forEach(el => el.classList.add('skeleton'));
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const id = `${pos.coords.latitude},${pos.coords.longitude}`;
                localStorage.setItem('lastId', id);
                localStorage.setItem('lastName', ''); // Backend resolverá el nombre
                localStorage.setItem('lastRegion', '');
                currentId = id;
                currentCityInfo = { id, name: '', region: '', lat: pos.coords.latitude, lon: pos.coords.longitude };
                getWeather(id);
            },
            () => { /* usuario denegó */ },
            { timeout: 8000, enableHighAccuracy: false }
        );
    });
}

// ============================================================
// 19. CARGA INICIAL
// ============================================================
window.addEventListener('load', () => {
    // Splash screen
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if (splash) splash.classList.add('hidden');
    }, 2000);

    // Aplicar tema guardado
    const savedTheme = localStorage.getItem('aeris_theme_pref');
    if (savedTheme) applyTheme(savedTheme);

    // Modal de notificaciones
    if (Notification.permission === 'default') {
        setTimeout(() => {
            const modalEl = document.getElementById('notificationModal');
            if (modalEl && window.bootstrap) {
                const bsModal = new bootstrap.Modal(modalEl);
                bsModal.show();
                document.getElementById('enableNotifBtn').onclick = () => { bsModal.hide(); registerPush(false); };
            }
        }, 3500);
    }

    renderFavorites();

    // Geolocalización automática al inicio
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const id = `${pos.coords.latitude},${pos.coords.longitude}`;
                localStorage.setItem('lastId', id);
                localStorage.setItem('lastName', '');
                localStorage.setItem('lastRegion', '');
                currentId = id;
                currentCityInfo = { id, name: '', region: '', lat: pos.coords.latitude, lon: pos.coords.longitude };
                getWeather(id);
            },
            () => { getWeather(localStorage.getItem('lastId') || 'Madrid'); },
            { timeout: 4000, enableHighAccuracy: false }
        );
    } else {
        getWeather(localStorage.getItem('lastId') || 'Madrid');
    }
});

// Registrar Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js'));
}
