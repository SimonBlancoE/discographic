function topCount(list = []) {
  return list?.[0]?.count || 0;
}

const ACHIEVEMENT_COPY = {
  es: {
    tiered: {
      collector: {
        title: 'Coleccionista en alza',
        description: 'Tu maleta crece por fases: entrada, escalada y dominación total.',
        tiers: ['Fácil entrada', 'Gran escalada', 'Cabina seria', 'Archivador feroz', 'Monstruo de estantería', 'Discographic mitológico']
      },
      notes: {
        title: 'Cronista de funda',
        description: 'Cada nota convierte una compra en una historia.',
        tiers: ['Fácil entrada', 'Gran escalada', 'Archivo maestro', 'Anotador feroz', 'Memoria total']
      },
      ratings: {
        title: 'Selector con criterio',
        description: 'Poner estrellas también es declarar principios.',
        tiers: ['Fácil entrada', 'Gran escalada', 'Jurador supremo', 'Tajante profesional', 'Canon absoluto']
      },
      market: {
        title: 'Radar de mercado',
        description: 'Tu colección aprende a hablar en precios reales.',
        tiers: ['Fácil entrada', 'Gran escalada', 'Mercado dominado', 'Mesa de tasación', 'Ticker viviente']
      },
      timeline: {
        title: 'Viajero del tiempo',
        description: 'Saltas entre épocas como si nada.',
        tiers: ['Fácil entrada', 'Gran escalada', 'Museo personal', 'Curador temporal']
      },
      styles: {
        title: 'Mutante de estilos',
        description: 'No te casas con un solo sonido.',
        tiers: ['Fácil entrada', 'Gran escalada', 'Abarca todo', 'Quimera sonora']
      }
    },
    hidden: {
      earlyBird: ['Madrugador del crate', 'Tienes discos de tres o más décadas y menos de 80 discos. Empezaste con hambre fina.'],
      wall: ['Pared maestra', 'Tu artista más repetido ya ocupa una pared imaginaria.'],
      fearless: ['Sin miedo al ridículo', 'Tocas al menos 15 estilos distintos. Que pase el siguiente género.'],
      marker: ['Subrayador compulsivo', 'Anotaste tanto que cada funda empieza a tener segunda vida.'],
      appraiser: ['Tasador de pasillo', 'Conoces el precio de una buena parte de tu arsenal.'],
      label: ['Sello fijo', 'Un sello ya te conoce por tu nombre.'],
      loop: ['Loop infinito', 'Un género reina con mano de hierro.'],
      blackBox: ['Caja negra', 'Has valorado tantos discos que ya no finges objetividad.'],
      archivedBooth: ['Cabina archivada', 'Tienes notas y ratings por todas partes. Esto ya parece una auditoría.'],
      marathon: ['Maratonista del vinilo', 'La cronología de entrada ya parece una serie larga.'],
      showcase: ['Vitrina obsesiva', 'Tienes un buen trozo de la colección ya tasado.'],
      balance: ['Equilibrista', 'Mantienes una colección grande sin dejar de documentarla.'],
      terminal: ['Coleccionismo terminal', 'Has entrado en la órbita de las cuatro cifras.'],
      curve: ['Curva peligrosa', 'Tu biblioteca crece con un pulso sospechosamente constante.'],
      altar: ['Altar privado', 'Un solo artista ya parece una religión doméstica.']
    }
  },
  en: {
    tiered: {
      collector: {
        title: 'Collector on the rise',
        description: 'Your crate grows in stages: entry, escalation, and total domination.',
        tiers: ['Easy entry', 'Big climb', 'Serious booth', 'Fierce archivist', 'Shelf monster', 'Mythic Discographic']
      },
      notes: {
        title: 'Sleeve chronicler',
        description: 'Every note turns a purchase into a story.',
        tiers: ['Easy entry', 'Big climb', 'Master archive', 'Relentless annotator', 'Total memory']
      },
      ratings: {
        title: 'Sharp-eared selector',
        description: 'Giving stars is also a way to declare your principles.',
        tiers: ['Easy entry', 'Big climb', 'Supreme judge', 'Professional hardliner', 'Absolute canon']
      },
      market: {
        title: 'Market radar',
        description: 'Your collection learns to speak in real prices.',
        tiers: ['Easy entry', 'Big climb', 'Market mastered', 'Valuation desk', 'Living ticker']
      },
      timeline: {
        title: 'Time traveler',
        description: 'You jump across eras as if it were nothing.',
        tiers: ['Easy entry', 'Big climb', 'Personal museum', 'Time curator']
      },
      styles: {
        title: 'Style mutant',
        description: 'You do not commit to a single sound.',
        tiers: ['Easy entry', 'Big climb', 'All-embracing', 'Sound chimera']
      }
    },
    hidden: {
      earlyBird: ['Early crate bird', 'You own records from three or more decades and fewer than 80 records total. You started with refined hunger.'],
      wall: ['Master wall', 'Your most repeated artist already fills an imaginary wall.'],
      fearless: ['Fearless taste', 'You touch at least 15 different styles. Bring on the next genre.'],
      marker: ['Compulsive highlighter', 'You have written so many notes that every sleeve is living a second life.'],
      appraiser: ['Hallway appraiser', 'You know the price of a large part of your arsenal.'],
      label: ['Label regular', 'A label already knows you by name.'],
      loop: ['Infinite loop', 'One genre rules with an iron fist.'],
      blackBox: ['Black box', 'You have rated so many records that objectivity is no longer an option.'],
      archivedBooth: ['Archived booth', 'You have notes and ratings everywhere. This is starting to look like an audit.'],
      marathon: ['Vinyl marathoner', 'Your add-history timeline already feels like a long-running series.'],
      showcase: ['Obsessive showcase', 'A good chunk of the collection is already priced.'],
      balance: ['Tightrope walker', 'You keep a large collection without stopping the documentation work.'],
      terminal: ['Terminal collecting', 'You have entered four-digit orbit.'],
      curve: ['Dangerous curve', 'Your library grows with suspiciously steady momentum.'],
      altar: ['Private altar', 'A single artist already feels like a household religion.']
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
    createHiddenAchievement({ id: 'altar-privado', emoji: '🕯️', title: copy.hidden.altar[0], description: copy.hidden.altar[1], unlocked: topArtistStack >= 30 }, t)
  ];

  return { tiered, hidden };
}
