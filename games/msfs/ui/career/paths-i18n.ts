// Kariyer yollarının sözlüğü: yol tanıtımları, kayıt adımları, rütbe basamakları, hedefler, yol değiştirme.
// Türkçe asıl kaynaktır; İngilizce aynı tipe bağlıdır. Yol ve rütbe adları arka uçtan gelir (`paths.rs`).

import { useDict } from "@/lib/i18n";
import type { CareerPath } from "./types";

/** Sayının Türkçe yönelme eki, okunuşa göre: 50'ye, 55'e, 60'a, 70'e. */
export function dat(n: number): string {
  const v = Math.abs(Math.round(n));
  const ones: Record<number, string> = { 1: "e", 2: "ye", 3: "e", 4: "e", 5: "e", 6: "ya", 7: "ye", 8: "e", 9: "a" };
  const tens: Record<number, string> = { 0: "a", 1: "a", 2: "ye", 3: "a", 4: "a", 5: "ye", 6: "a", 7: "e", 8: "e", 9: "a" };
  const suffix = v % 10 ? ones[v % 10] : v % 100 ? tens[(v % 100) / 10] : v === 0 ? "a" : "e";
  return `'${suffix}`;
}

interface PathCopy {
  /** Tek satırlık tanıtım. */
  tagline: string;
  /** Ne uçarsın (gerçek tipler, kısa). */
  flies: string;
  /** "Deneyimli başla" paketinin cümlesi. */
  fast: string;
}

const tr = {
  path: {
    airline: {
      tagline: "Tarifeli yolcu seferleri: bölgesel turboproptan dar ve geniş gövde jetlere.",
      flies: "ATR 72 · CRJ · A320 · 737 · 787",
      fast: "ATPL ve dar gövde tip yetkisiyle bir havayolunda ikinci pilot olarak başlarsın.",
    },
    cargo: {
      tagline: "Yük ve posta: gece besleme hatlarında turboproptan kargo jetlerine.",
      flies: "Caravan · King Air · ATR 72F · 737F · 747F",
      fast: "Ticari lisans, çok motor ve aletli uçuş yetkisiyle besleme hatlarında başlarsın.",
    },
    bush: {
      tagline: "Uzak bölgeler, kısa ve toprak pistler: kamplara erzak, ekip ve yakıt.",
      flies: "Cub · C185 · Beaver · Kodiak · Caravan",
      fast: "Özel pilot lisansı ve hafif uçak deneyimiyle doğrudan arazi işlerine başlarsın.",
    },
    medical: {
      tagline: "Hasta nakli ve arama-kurtarma: zamana karşı, helikopter ve turbopropla.",
      flies: "H135 · H125 · Bell 407 · PC-12 · King Air",
      fast: "Ticari lisans, helikopter ve aletli uçuş yetkisiyle ambulans pilotu olarak başlarsın.",
    },
    charter: {
      tagline: "Talep üzerine uçuşlar: iş ekipleri, aileler, VIP yolcular; hedef iş jeti.",
      flies: "Baron · King Air · Citation CJ4 · Longitude",
      fast: "Ticari lisans, çok motor ve aletli uçuş yetkisiyle charter pilotu olarak başlarsın.",
    },
    aerial: {
      tagline: "Panoramik tur, paraşütçü atlatma, hava fotoğrafı: her uçuş bir görev.",
      flies: "C172 · Porter · Caravan · Twin Otter",
      fast: "Ticari lisansla tur, atlayış ve fotoğraf uçuşlarına başlarsın.",
    },
    general: {
      tagline: "Her işten biraz: kargo, yolcu, charter, arazi. Pano her türü eşit sunar.",
      flies: "Lisansın ne açarsa: hafif uçaktan jete",
      fast: "Ticari lisans, çok motor ve aletli uçuş yetkisiyle her türden işe başlarsın.",
    },
  } satisfies Record<CareerPath, PathCopy>,
  onboarding: {
    eyebrow: "Modstead Kariyer",
    step: (n: number) => `Adım ${n} / 3`,
    steps: ["Yol", "Başlangıç", "Pilot kaydı"],
    pathTitle: "Nasıl bir pilot olacaksın?",
    pathBody: "Bir yol seç. İlan panosu, rütben ve hedeflerin buna göre şekillenir; diğer işler de açık kalır. Yolunu sonra değiştirebilirsin.",
    startTitle: "Nereden başlıyorsun?",
    startBody: "Uçuş okulundan başlayıp her lisansı kendin alabilir ya da yolun lisanslarıyla doğrudan işe girebilirsin.",
    formTitle: "Pilot kaydı",
    formBody: "Adını ve ana üssünü seç. Ana üs evindir: dinlenmek orada ücretsizdir, tescil işaretin oradan gelir.",
    continue: "Devam",
    back: "Geri",
    change: "Değiştir",
    goal: "Hedef",
    jobs: "Tipik işler",
    noBonus: "Yol primi yok",
    mixed: "Her türden iş",
    general: "Ya da yol seçme",
    scratch: {
      label: "Sıfırdan",
      title: "Uçuş okulundan başla",
      body: "Öğrenci pilot olarak eğitmenle eğitim uçuşları yaparsın; lisanslarını sınav uçuşlarıyla tek tek alırsın.",
      badge: "Önerilen",
      first: "İlk işler: eğitim uçuşları",
    },
    fast: {
      label: "Deneyimli başla",
      title: "Yolun lisanslarıyla başla",
      note: "Sınavları ve lisans ücretlerini atlarsın; buna karşılık birikimin azdır.",
    },
    licences: "Lisanslar",
    hours: "Uçuş saati",
    money: "Bakiye",
    rank: "Rütbe",
    flyable: "Uçabildiğin",
    route: "Yolun lisans sırası",
    noRank: "Öğrenci pilot",
    homeSuggested: "Bu yol için önerilen üsler",
    homeAny: "Ya da istediğin havalimanını ara.",
    summary: "Seçimin",
    youGet: "Başlarken",
    create: "Kariyere başla",
    catalogError: "Yol bilgisi alınamadı. Uygulama güncellendikten sonra yollar görünür.",
  },
  rank: {
    title: "Rütbe basamakları",
    yourPath: "Kariyer yolun",
    reached: "Ulaşıldı",
    current: "Şu an",
    next: "Sıradaki",
    locked: "Kilitli",
    payBonus: (n: number) => `Ücret +%${n}`,
    hoursIn: (have: string, need: string) => `Yolda ${have} / ${need} sa`,
    reputation: (have: number, need: number) => `İtibar ${have} / ${need}`,
    licences: "Lisans",
    noReq: "Şart yok",
    top: (name: string) => `En üst basamaktasın: ${name}.`,
    pathHours: "Yolda uçulan",
    pathHoursHint: "Yolun iş türlerinde uçtuğun saat (yol seçmeden önce uçtukların da sayılır). Rütbe bu saatle, lisanslarla ve itibarla açılır.",
    bonusHint: (pay: number, xp: number) => `Yolundaki işlerde ücrete +%${pay}, XP'ye +%${xp} eklenir. Yolun dışındaki işler de alınabilir, yalnızca prim yoktur.`,
    sticky: "Ulaştığın basamak kalıcıdır: itibarın sonradan düşse de rütben geri alınmaz.",
    general: "Serbest pilotsun: rütbe ve prim yok, pano her türden işi eşit sunar. Bir yol seçersen ilanlar ona göre şekillenir.",
    choose: "Yol seç",
    change: "Yolu değiştir",
    route: "Lisans sırası",
  },
  goals: {
    eyebrow: (path: string, rank: string) => `${path} · ${rank}`,
    nextRank: (name: string) => `Sıradaki rütbe: ${name}`,
    atTop: (name: string) => `En üst basamak: ${name}`,
    atTopBody: "Yolunun zirvesindesin. Yeni yetkiler ve büyük uçaklar için lisans sırasına devam edebilirsin.",
    todo: "Yapman gerekenler",
    getLicence: (codes: string) => `${codes} al`,
    flyMore: (h: string, kinds: string) => `Yolundaki işlerde ${h} sa daha uç (${kinds})`,
    reputation: (n: number) => `İtibarını ${n}${dat(n)} çıkar`,
    doneReq: "Tamam",
    seeLadder: "Basamaklar",
    and: " ve ",
  },
  tags: {
    onPath: "Yolunda",
    offPath: "Yol dışı",
    offPathHint: "Bu iş kariyer yolunun dışında: alabilirsin, ama prim yok ve saati rütbene sayılmaz.",
    onPathHint: (pay: number, xp: number) => (pay > 0 ? `Yolundaki iş: ücrete +%${pay} eklendi, uçuş sonunda XP +%${xp}. Saati rütbene sayılır.` : `Yolundaki iş: uçuş sonunda XP +%${xp}. Saati rütbene sayılır.`),
    bonus: (pay: number, xp: number) => (pay > 0 ? `+%${pay} ücret · +%${xp} XP` : `+%${xp} XP`),
    filter: "Yol",
    filterAll: "Tümü",
    filterOn: "Yolumda",
    filterOff: "Yol dışı",
    boardSub: (n: number) => `${n} yolunda`,
  },
  change: {
    title: "Kariyer yolunu değiştir",
    subtitle: "Yeni yolun ilan panosunu, rütbeni ve primlerini belirler.",
    keeps: "Kalanlar",
    keepsBody: "Lisansların, uçuş saatlerin, paran, itibarın ve filon.",
    changes: "Değişenler",
    changesBody: "İlanların çoğu yeni yoldan gelir. Rütben o yolun işlerinde uçtuğun saatten hesaplanır; ulaştığın basamaklar kalıcıdır.",
    current: "Şu anki yolun",
    confirm: (name: string) => `${name} yoluna geç`,
    done: (name: string) => `Yeni yolun: ${name}`,
    busy: "Elinde iş varken yol değiştiremezsin.",
    rankThere: (name: string) => `Orada rütben: ${name}`,
    noRankThere: "Orada henüz basamakta değilsin",
  },
  promotion: (name: string) => `Terfi: ${name}`,
};

export type PathDict = typeof tr;

const en: PathDict = {
  path: {
    airline: {
      tagline: "Scheduled passenger flights: from regional turboprops to narrow- and widebody jets.",
      flies: "ATR 72 · CRJ · A320 · 737 · 787",
      fast: "Start as a first officer at an airline with an ATPL and a narrowbody type rating.",
    },
    cargo: {
      tagline: "Freight and mail: from night feeder turboprops to cargo jets.",
      flies: "Caravan · King Air · ATR 72F · 737F · 747F",
      fast: "Start on feeder routes with a commercial licence, multi-engine and instrument ratings.",
    },
    bush: {
      tagline: "Remote regions, short and dirt strips: supplies, crews and fuel for the camps.",
      flies: "Cub · C185 · Beaver · Kodiak · Caravan",
      fast: "Go straight to bush work with a private licence and light-aircraft experience.",
    },
    medical: {
      tagline: "Patient transfers and search and rescue: against the clock, by helicopter and turboprop.",
      flies: "H135 · H125 · Bell 407 · PC-12 · King Air",
      fast: "Start as an air ambulance pilot with a commercial licence, helicopter and instrument ratings.",
    },
    charter: {
      tagline: "On-demand flights for business teams, families and VIPs; the goal is a business jet.",
      flies: "Baron · King Air · Citation CJ4 · Longitude",
      fast: "Start as a charter pilot with a commercial licence, multi-engine and instrument ratings.",
    },
    aerial: {
      tagline: "Sightseeing tours, skydiver drops, aerial photography: every flight is a mission.",
      flies: "C172 · Porter · Caravan · Twin Otter",
      fast: "Start on tours, drops and photo flights with a commercial licence.",
    },
    general: {
      tagline: "A bit of everything: cargo, passengers, charter, bush. The board offers every kind equally.",
      flies: "Whatever your licences open, light aircraft to jets",
      fast: "Start on any kind of work with a commercial licence, multi-engine and instrument ratings.",
    },
  },
  onboarding: {
    eyebrow: "Modstead Career",
    step: (n: number) => `Step ${n} of 3`,
    steps: ["Path", "Start", "Pilot details"],
    pathTitle: "What kind of pilot will you be?",
    pathBody: "Pick a path. The job board, your rank and your goals follow it; other work stays open too. You can change your path later.",
    startTitle: "Where do you start?",
    startBody: "Start at the flight school and earn every licence yourself, or go straight to work with the path's licences.",
    formTitle: "Pilot details",
    formBody: "Choose your name and home base. Home is where you rest for free and where your registration comes from.",
    continue: "Continue",
    back: "Back",
    change: "Change",
    goal: "Goal",
    jobs: "Typical jobs",
    noBonus: "No path bonus",
    mixed: "Every kind of job",
    general: "Or skip the path",
    scratch: {
      label: "From scratch",
      title: "Start at the flight school",
      body: "Fly training flights with an instructor as a student pilot and earn your licences one checkride at a time.",
      badge: "Recommended",
      first: "First jobs: training flights",
    },
    fast: {
      label: "Experienced start",
      title: "Start with the path's licences",
      note: "You skip the checkrides and licence fees, but you start with little savings.",
    },
    licences: "Licences",
    hours: "Flight hours",
    money: "Balance",
    rank: "Rank",
    flyable: "You can fly",
    route: "Licence route",
    noRank: "Student pilot",
    homeSuggested: "Suggested bases for this path",
    homeAny: "Or search for any airport.",
    summary: "Your choice",
    youGet: "You start with",
    create: "Start the career",
    catalogError: "Could not load the career paths. They appear once the app is updated.",
  },
  rank: {
    title: "Rank ladder",
    yourPath: "Your career path",
    reached: "Reached",
    current: "Current",
    next: "Next",
    locked: "Locked",
    payBonus: (n: number) => `Pay +${n}%`,
    hoursIn: (have: string, need: string) => `${have} / ${need} h on the path`,
    reputation: (have: number, need: number) => `Reputation ${have} / ${need}`,
    licences: "Licence",
    noReq: "No requirements",
    top: (name: string) => `You are at the top: ${name}.`,
    pathHours: "On the path",
    pathHoursHint: "Hours flown on your path's job kinds (including those flown before you chose it). Ranks open with these hours, licences and reputation.",
    bonusHint: (pay: number, xp: number) => `Jobs on your path pay +${pay}% and give +${xp}% XP. Off-path jobs can still be taken, just without the bonus.`,
    sticky: "A rank you reach is kept: it is not taken away if your reputation drops later.",
    general: "You are a freelance pilot: no rank and no bonus, the board offers every kind of job equally. Pick a path and the listings follow it.",
    choose: "Choose a path",
    change: "Change path",
    route: "Licence route",
  },
  goals: {
    eyebrow: (path: string, rank: string) => `${path} · ${rank}`,
    nextRank: (name: string) => `Next rank: ${name}`,
    atTop: (name: string) => `Top rank: ${name}`,
    atTopBody: "You have reached the top of your path. Keep following the licence route for new ratings and bigger aircraft.",
    todo: "What it takes",
    getLicence: (codes: string) => `Get ${codes}`,
    flyMore: (h: string, kinds: string) => `Fly ${h} h more on path jobs (${kinds})`,
    reputation: (n: number) => `Raise your reputation to ${n}`,
    doneReq: "Done",
    seeLadder: "Ladder",
    and: " and ",
  },
  tags: {
    onPath: "On path",
    offPath: "Off path",
    offPathHint: "This job is off your career path: you can take it, but there is no bonus and its hours do not count toward your rank.",
    onPathHint: (pay: number, xp: number) => (pay > 0 ? `On your path: +${pay}% added to the pay, +${xp}% XP after the flight. Its hours count toward your rank.` : `On your path: +${xp}% XP after the flight. Its hours count toward your rank.`),
    bonus: (pay: number, xp: number) => (pay > 0 ? `+${pay}% pay · +${xp}% XP` : `+${xp}% XP`),
    filter: "Path",
    filterAll: "All",
    filterOn: "On my path",
    filterOff: "Off path",
    boardSub: (n: number) => `${n} on your path`,
  },
  change: {
    title: "Change career path",
    subtitle: "Your path shapes the job board, your rank and your bonuses.",
    keeps: "What stays",
    keepsBody: "Your licences, flight hours, money, reputation and fleet.",
    changes: "What changes",
    changesBody: "Most listings come from the new path. Your rank is worked out from the hours you flew on that path's jobs; ranks you reach are kept.",
    current: "Your current path",
    confirm: (name: string) => `Switch to ${name}`,
    done: (name: string) => `Your new path: ${name}`,
    busy: "You cannot change path while you have a job.",
    rankThere: (name: string) => `Your rank there: ${name}`,
    noRankThere: "No rank there yet",
  },
  promotion: (name: string) => `Promoted: ${name}`,
};

export function usePathT(): PathDict {
  return useDict({ tr, en });
}

export { tr as pathTr, en as pathEn };
