function topCount(list = []) {
  return list?.[0]?.count || 0;
}

const ACHIEVEMENT_COPY = {
  es: {
    tiered: {
      collector: {
        title: 'Coleccionista en alza',
        description: 'No solo acumulas discos: estás levantando una colección con peso propio, desde las primeras cajas hasta una estantería que ya impone respeto.',
        tiers: ['Fácil entrada', 'Gran escalada', 'Cabina seria', 'Archivador feroz', 'Monstruo de estantería', 'Discographic mitológico']
      },
      notes: {
        title: 'Cronista de funda',
        description: 'Cada nota deja contexto, recuerdos y porqués. Lo que otros guardan como inventario, tú lo conviertes en memoria curada.',
        tiers: ['Fácil entrada', 'Gran escalada', 'Archivo maestro', 'Anotador feroz', 'Memoria total']
      },
      ratings: {
        title: 'Selector con criterio',
        description: 'Poner estrellas aquí no es trámite: es separar relleno de favoritos y dejar claro qué merece volver a sonar.',
        tiers: ['Fácil entrada', 'Gran escalada', 'Jurador supremo', 'Tajante profesional', 'Canon absoluto']
      },
      market: {
        title: 'Radar de mercado',
        description: 'No te basta con tenerlos; también sigues su pulso económico. Tu colección empieza a comportarse como archivo y como mercado.',
        tiers: ['Fácil entrada', 'Gran escalada', 'Mercado dominado', 'Mesa de tasación', 'Ticker viviente']
      },
      timeline: {
        title: 'Viajero del tiempo',
        description: 'Tu estantería cruza décadas con intención. Cuanto más avanzas, más se parece a un mapa temporal de tus obsesiones.',
        tiers: ['Fácil entrada', 'Gran escalada', 'Museo personal', 'Curador temporal']
      },
      styles: {
        title: 'Mutante de estilos',
        description: 'Saltas de un sonido a otro sin pedir permiso. La colección gana color porque tu gusto no se deja encerrar en una sola etiqueta.',
        tiers: ['Fácil entrada', 'Gran escalada', 'Abarca todo', 'Quimera sonora']
      }
    },
    hidden: {
      earlyBird: ['Madrugador del crate', 'Tienes discos de tres o más décadas y todavía una colección pequeña. Empezaste afinando el gusto antes que el volumen.'],
      wall: ['Pared maestra', 'Tu artista más repetido ya no cabe en un rincón mental: empieza a levantar una pared propia dentro de la colección.'],
      fearless: ['Sin miedo al ridículo', 'Tocas al menos 15 estilos distintos y sigues entrando sin pedir permiso. Tu colección no tolera fronteras cómodas.'],
      marker: ['Subrayador compulsivo', 'Has escrito tanto sobre tus discos que cada funda parece llevar una capa extra de memoria personal.'],
      appraiser: ['Tasador de pasillo', 'Conoces el precio de una parte seria de tu arsenal. Ya no miras la colección solo con oído, también con tasación.'],
      label: ['Sello fijo', 'Un sello aparece tantas veces que ya parece una relación estable, no una coincidencia de catálogo.'],
      loop: ['Loop infinito', 'Un género reina con mano de hierro y vuelve una y otra vez al centro de gravedad de tu estantería.'],
      blackBox: ['Caja negra', 'Has valorado tantos discos que tu criterio ya opera como sistema autónomo. La neutralidad quedó atrás hace tiempo.'],
      archivedBooth: ['Cabina archivada', 'Notas y ratings se acumulan por todas partes. Tu colección empieza a parecer un puesto de escucha auditado.'],
      marathon: ['Maratonista del vinilo', 'La cronología de entradas ya tiene temporadas, capítulos y continuidad. Lo tuyo dejó de ser una racha pasajera.'],
      showcase: ['Vitrina obsesiva', 'Una parte importante de la colección ya está tasada. Tu archivo empieza a lucirse como exposición y balance a la vez.'],
      balance: ['Equilibrista', 'Mantienes una colección grande sin renunciar a documentarla. Sigues ampliando sin perder el pulso del detalle.'],
      terminal: ['Coleccionismo terminal', 'Entraste en la órbita de las cuatro cifras. A esta altura ya no visitas el hobby: vives dentro de él.'],
      curve: ['Curva peligrosa', 'Tu biblioteca crece con un pulso demasiado constante para llamarlo casualidad. Aquí ya hay método, impulso y hambre.'],
      altar: ['Altar privado', 'Un solo artista ocupa tanto espacio que la colección ya le reservó una liturgia doméstica.'],
      commentedSleeves: ['Funda comentada', 'No dejas discos mudos: toda la colección ya tiene contexto propio escrito por ti, como si cada pieza llevara libreto.'],
      finalVerdict: ['Veredicto final', 'Todo lo que entra en tu colección pasa por jurado. No queda un solo disco sin estrellas ni sentencia.'],
      pricedInventory: ['Inventario tasado', 'Toda la colección ya habla en cifras. Cada disco tiene precio y cara de balance doméstico.'],
      soundAtlas: ['Atlas sonoro', 'Cruzas décadas, estilos y sellos a la vez. La colección ya parece más geografía musical que capricho aislado.'],
      totalControl: ['Control total', 'Ratings, notas y precios avanzan casi al mismo ritmo. Esto ya no es solo coleccionar: es gobernar un archivo.']
    }
  },
  en: {
    tiered: {
      collector: {
        title: 'Collector on the rise',
        description: 'You are not just stacking records; you are building a collection with real gravity, from first crates to shelves that already command respect.',
        tiers: ['Easy entry', 'Big climb', 'Serious booth', 'Fierce archivist', 'Shelf monster', 'Mythic Discographic']
      },
      notes: {
        title: 'Sleeve chronicler',
        description: 'Every note adds context, memory, and motive. What others keep as inventory, you turn into a curated memory bank.',
        tiers: ['Easy entry', 'Big climb', 'Master archive', 'Relentless annotator', 'Total memory']
      },
      ratings: {
        title: 'Sharp-eared selector',
        description: 'Star ratings are not paperwork here; they draw a hard line between filler and favorites and show what deserves another spin.',
        tiers: ['Easy entry', 'Big climb', 'Supreme judge', 'Professional hardliner', 'Absolute canon']
      },
      market: {
        title: 'Market radar',
        description: 'Owning records is not enough; you also track their market pulse. The collection starts acting like both archive and asset.',
        tiers: ['Easy entry', 'Big climb', 'Market mastered', 'Valuation desk', 'Living ticker']
      },
      timeline: {
        title: 'Time traveler',
        description: 'Your shelves move across decades with intent. The deeper you go, the more they look like a time map of your obsessions.',
        tiers: ['Easy entry', 'Big climb', 'Personal museum', 'Time curator']
      },
      styles: {
        title: 'Style mutant',
        description: 'You jump from one sound to another without asking permission. The collection gets richer because your taste refuses one label.',
        tiers: ['Easy entry', 'Big climb', 'All-embracing', 'Sound chimera']
      }
    },
    hidden: {
      earlyBird: ['Early crate bird', 'You own records from three or more decades while the collection is still small. You started by sharpening taste before chasing volume.'],
      wall: ['Master wall', 'Your most repeated artist no longer fits in a mental corner. They are starting to claim a wall of their own.'],
      fearless: ['Fearless taste', 'You move through at least 15 styles without hesitation. Your collection has no patience for safe borders.'],
      marker: ['Compulsive highlighter', 'You have written so many notes that every sleeve feels like it now carries a second layer of personal memory.'],
      appraiser: ['Hallway appraiser', 'You know the price of a serious portion of your arsenal. You hear the collection, but you also value it.'],
      label: ['Label regular', 'One label appears so often that it feels less like coincidence and more like an ongoing relationship.'],
      loop: ['Infinite loop', 'One genre rules with an iron fist and keeps pulling the whole shelf back into its orbit.'],
      blackBox: ['Black box', 'You have rated so many records that your taste now runs like an autonomous system. Neutrality left long ago.'],
      archivedBooth: ['Archived booth', 'Notes and ratings pile up everywhere. The collection is starting to look like an audited listening station.'],
      marathon: ['Vinyl marathoner', 'Your add-history timeline already has seasons, episodes, and continuity. This stopped being a short phase a while ago.'],
      showcase: ['Obsessive showcase', 'A meaningful slice of the collection is already priced. Your archive is turning into both exhibit and balance sheet.'],
      balance: ['Tightrope walker', 'You keep a large collection growing without abandoning the documentation work. Scale has not killed discipline.'],
      terminal: ['Terminal collecting', 'You have entered four-digit orbit. At this point you do not visit the hobby; you live inside it.'],
      curve: ['Dangerous curve', 'Your library grows with momentum far too steady to call accidental. There is method, appetite, and repetition here.'],
      altar: ['Private altar', 'A single artist takes up so much space that the collection has effectively built them a household shrine.'],
      commentedSleeves: ['Annotated sleeves', 'You do not leave records mute: the whole collection now carries your written context, like every piece ships with liner notes.'],
      finalVerdict: ['Final verdict', 'Everything in your collection passes through a jury of one. Not a single record remains unrated.'],
      pricedInventory: ['Valued inventory', 'The whole collection now speaks in numbers. Every record has a price and a place in the household ledger.'],
      soundAtlas: ['Sound atlas', 'You cross decades, styles, and labels at once. The collection now feels more like musical geography than isolated impulse.'],
      totalControl: ['Total control', 'Ratings, notes, and prices are all moving together. This is no longer just collecting; it is archive governance.']
    }
  }
};

function buildTier(progress, tiers, t) {
  const unlockedIndex = tiers.reduce((highest, tier, index) => (progress >= tier.goal ? index : highest), -1);
  const nextTier = tiers[unlockedIndex + 1] || null;
  const currentTier = tiers[Math.max(unlockedIndex, 0)];

  return {
    currentTier: unlockedIndex >= 0 ? currentTier.label : t('achievement.locked'),
    unlockedTierCount: Math.max(unlockedIndex + 1, 0),
    totalTiers: tiers.length,
    nextGoal: nextTier?.goal || null,
    nextLabel: nextTier?.label || null,
    completed: unlockedIndex === tiers.length - 1
  };
}

function createTieredAchievement({ id, emoji, title, description, progress, tiers }, t) {
  const tier = buildTier(progress, tiers, t);
  return {
    id,
    emoji,
    title,
    description,
    progress,
    tier,
    hidden: false,
    unlocked: progress > 0,
    badgeText: tier.completed ? t('achievement.completed') : tier.currentTier
  };
}

function createHiddenAchievement({ id, emoji, title, description, unlocked }, t) {
  return {
    id,
    emoji,
    title,
    description,
    unlocked,
    hidden: true,
    badgeText: unlocked ? t('achievement.discovered') : t('achievement.hidden')
  };
}

export function buildAchievements(stats, t, locale = 'es') {
  if (!stats) {
    return { tiered: [], hidden: [] };
  }

  const copy = ACHIEVEMENT_COPY[locale] || ACHIEVEMENT_COPY.es;

  const totals = stats.totals || {};
  const totalRecords = totals.total_records || 0;
  const ratedRecords = totals.rated_records || 0;
  const notesRecords = totals.notes_records || 0;
  const pricedRecords = totals.priced_records || 0;
  const decades = stats.decades?.length || 0;
  const styles = stats.styles?.length || 0;
  const labels = stats.labels?.length || 0;
  const growthMonths = stats.growth?.length || 0;
  const topArtistStack = topCount(stats.artists);
  const topGenreStack = topCount(stats.genres);

  const tiered = [
    createTieredAchievement({
      id: 'coleccionista',
      emoji: '💿',
      title: copy.tiered.collector.title,
      description: copy.tiered.collector.description,
      progress: totalRecords,
      tiers: [
        { label: copy.tiered.collector.tiers[0], goal: 50 },
        { label: copy.tiered.collector.tiers[1], goal: 250 },
        { label: copy.tiered.collector.tiers[2], goal: 1000 },
        { label: copy.tiered.collector.tiers[3], goal: 2500 },
        { label: copy.tiered.collector.tiers[4], goal: 5000 },
        { label: copy.tiered.collector.tiers[5], goal: 12000 }
      ]
    }, t),
    createTieredAchievement({
      id: 'notas',
      emoji: '📝',
      title: copy.tiered.notes.title,
      description: copy.tiered.notes.description,
      progress: notesRecords,
      tiers: [
        { label: copy.tiered.notes.tiers[0], goal: 25 },
        { label: copy.tiered.notes.tiers[1], goal: 120 },
        { label: copy.tiered.notes.tiers[2], goal: 300 },
        { label: copy.tiered.notes.tiers[3], goal: 750 },
        { label: copy.tiered.notes.tiers[4], goal: 2000 }
      ]
    }, t),
    createTieredAchievement({
      id: 'ratings',
      emoji: '⭐',
      title: copy.tiered.ratings.title,
      description: copy.tiered.ratings.description,
      progress: ratedRecords,
      tiers: [
        { label: copy.tiered.ratings.tiers[0], goal: 25 },
        { label: copy.tiered.ratings.tiers[1], goal: 120 },
        { label: copy.tiered.ratings.tiers[2], goal: 400 },
        { label: copy.tiered.ratings.tiers[3], goal: 1000 },
        { label: copy.tiered.ratings.tiers[4], goal: 2500 }
      ]
    }, t),
    createTieredAchievement({
      id: 'market',
      emoji: '💶',
      title: copy.tiered.market.title,
      description: copy.tiered.market.description,
      progress: pricedRecords,
      tiers: [
        { label: copy.tiered.market.tiers[0], goal: 40 },
        { label: copy.tiered.market.tiers[1], goal: 250 },
        { label: copy.tiered.market.tiers[2], goal: 900 },
        { label: copy.tiered.market.tiers[3], goal: 2500 },
        { label: copy.tiered.market.tiers[4], goal: 6000 }
      ]
    }, t),
    createTieredAchievement({
      id: 'timeline',
      emoji: '⏳',
      title: copy.tiered.timeline.title,
      description: copy.tiered.timeline.description,
      progress: decades,
      tiers: [
        { label: copy.tiered.timeline.tiers[0], goal: 3 },
        { label: copy.tiered.timeline.tiers[1], goal: 6 },
        { label: copy.tiered.timeline.tiers[2], goal: 9 },
        { label: copy.tiered.timeline.tiers[3], goal: 12 }
      ]
    }, t),
    createTieredAchievement({
      id: 'styles',
      emoji: '🌈',
      title: copy.tiered.styles.title,
      description: copy.tiered.styles.description,
      progress: styles,
      tiers: [
        { label: copy.tiered.styles.tiers[0], goal: 8 },
        { label: copy.tiered.styles.tiers[1], goal: 18 },
        { label: copy.tiered.styles.tiers[2], goal: 35 },
        { label: copy.tiered.styles.tiers[3], goal: 60 }
      ]
    }, t)
  ];

  const hidden = [
    createHiddenAchievement({ id: 'madrugador', emoji: '🌅', title: copy.hidden.earlyBird[0], description: copy.hidden.earlyBird[1], unlocked: decades >= 3 && totalRecords < 80 }, t),
    createHiddenAchievement({ id: 'pared-maestra', emoji: '🧱', title: copy.hidden.wall[0], description: copy.hidden.wall[1], unlocked: topArtistStack >= 15 }, t),
    createHiddenAchievement({ id: 'sin-miedo', emoji: '🎢', title: copy.hidden.fearless[0], description: copy.hidden.fearless[1], unlocked: styles >= 15 }, t),
    createHiddenAchievement({ id: 'subrayador', emoji: '🖍️', title: copy.hidden.marker[0], description: copy.hidden.marker[1], unlocked: notesRecords >= 180 }, t),
    createHiddenAchievement({ id: 'tasador', emoji: '💼', title: copy.hidden.appraiser[0], description: copy.hidden.appraiser[1], unlocked: pricedRecords >= 350 }, t),
    createHiddenAchievement({ id: 'sello-fijo', emoji: '🏷️', title: copy.hidden.label[0], description: copy.hidden.label[1], unlocked: labels >= 12 }, t),
    createHiddenAchievement({ id: 'loop-infinito', emoji: '🔁', title: copy.hidden.loop[0], description: copy.hidden.loop[1], unlocked: topGenreStack >= 120 }, t),
    createHiddenAchievement({ id: 'caja-negra', emoji: '🕶️', title: copy.hidden.blackBox[0], description: copy.hidden.blackBox[1], unlocked: ratedRecords >= 180 }, t),
    createHiddenAchievement({ id: 'cabina-archivada', emoji: '🗃️', title: copy.hidden.archivedBooth[0], description: copy.hidden.archivedBooth[1], unlocked: ratedRecords >= 120 && notesRecords >= 120 }, t),
    createHiddenAchievement({ id: 'maratonista', emoji: '🏃', title: copy.hidden.marathon[0], description: copy.hidden.marathon[1], unlocked: growthMonths >= 24 }, t),
    createHiddenAchievement({ id: 'vitrina', emoji: '🪞', title: copy.hidden.showcase[0], description: copy.hidden.showcase[1], unlocked: totalRecords > 0 && pricedRecords / totalRecords >= 0.6 }, t),
    createHiddenAchievement({ id: 'equilibrista', emoji: '⚖️', title: copy.hidden.balance[0], description: copy.hidden.balance[1], unlocked: totalRecords >= 600 && notesRecords >= 200 }, t),
    createHiddenAchievement({ id: 'coleccionismo-terminal', emoji: '🛰️', title: copy.hidden.terminal[0], description: copy.hidden.terminal[1], unlocked: totalRecords >= 1000 }, t),
    createHiddenAchievement({ id: 'curva-peligrosa', emoji: '📈', title: copy.hidden.curve[0], description: copy.hidden.curve[1], unlocked: growthMonths >= 12 && totalRecords >= 300 }, t),
    createHiddenAchievement({ id: 'altar-privado', emoji: '🕯️', title: copy.hidden.altar[0], description: copy.hidden.altar[1], unlocked: topArtistStack >= 30 }, t),
    createHiddenAchievement({ id: 'funda-comentada', emoji: '📓', title: copy.hidden.commentedSleeves[0], description: copy.hidden.commentedSleeves[1], unlocked: totalRecords >= 120 && notesRecords === totalRecords }, t),
    createHiddenAchievement({ id: 'veredicto-final', emoji: '⚔️', title: copy.hidden.finalVerdict[0], description: copy.hidden.finalVerdict[1], unlocked: totalRecords >= 120 && ratedRecords === totalRecords }, t),
    createHiddenAchievement({ id: 'inventario-tasado', emoji: '🧾', title: copy.hidden.pricedInventory[0], description: copy.hidden.pricedInventory[1], unlocked: totalRecords >= 120 && pricedRecords === totalRecords }, t),
    createHiddenAchievement({ id: 'atlas-sonoro', emoji: '🗺️', title: copy.hidden.soundAtlas[0], description: copy.hidden.soundAtlas[1], unlocked: decades >= 8 && styles >= 25 && labels >= 15 }, t),
    createHiddenAchievement({ id: 'control-total', emoji: '🧠', title: copy.hidden.totalControl[0], description: copy.hidden.totalControl[1], unlocked: totalRecords >= 300 && ratedRecords / totalRecords >= 0.75 && notesRecords / totalRecords >= 0.5 && pricedRecords / totalRecords >= 0.5 }, t)
  ];

  return { tiered, hidden };
}
