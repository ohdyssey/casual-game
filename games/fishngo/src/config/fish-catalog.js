/**
 * 어종 카탈로그 (Fish Species Catalog) — 게임 보상/도감 마스터 데이터.
 *
 * 출처: 사용자 제공 Google Docs "Fish Species Table - Game Rewards System"
 *   (docs.google.com/document/d/1UCiXaACaGZdQxGvdQaoUQQA1fBH-9M7FTMn0A5HVXT4)
 *
 * ⚠️ 현재 게임 로직(fish.config.js 의 8 활성 어종)과는 별개의 "예정" 데이터.
 *    아직 spawn/도감/보상 시스템에 연결되지 않음 — 추후 게임 데이터로 편입 예정.
 *
 * 구성: 10 지역 × 각 7종 = 70종. 해금 스테이지 1~50, 보상 120~50,000 골드.
 *
 * 필드:
 *   no            : 원본 문서 번호 (1~70)
 *   id            : 게임용 영문 식별자 (snake_case) — 추후 sprite/도감 키로 사용 가능
 *   nameKo        : 국문명 (문서 원문)
 *   nameEn        : 영문 일반명 (common name)
 *   scientificName: 학명 (대표 종; 일반명이 과(科) 단위면 대표 속/종)
 *   regionKo/En   : 지역 (국문 / 문서 제공 영문)
 *   unlockStage   : 해금 스테이지 (1~50)
 *   gradeKo       : 등급 설명 (문서 원문 — 크기/유형 혼합 분류)
 *   gradeEn       : 등급 영문 의역
 *   reward        : 획득 보상 (골드, 숫자)
 *
 * ※ 학명/영문명은 한국 통용명 기준 best-effort. 일부 동음·통칭(예: 다금바리, 청새치,
 *   광어/넙치)은 note 로 표기. 교차검증 후 갱신.
 */

export const FISH_CATALOG_REGIONS = [
  { ko: '열대 산호초',   en: 'Tropical Coral Reef',  range: [1, 7],   stages: [1, 4]   },
  { ko: '연안 방파제',   en: 'Coastal Breakwater',   range: [8, 14],  stages: [4, 8]   },
  { ko: '모래바닥 해역', en: 'Sandy Bottom Waters',  range: [15, 21], stages: [8, 13]  },
  { ko: '갯바위/암초',   en: 'Rocky Shore/Reef',     range: [22, 28], stages: [13, 19] },
  { ko: '동아시아 연안', en: 'East Asia Coastal',    range: [29, 35], stages: [19, 25] },
  { ko: '한류 해역',     en: 'Cold Current Waters',  range: [36, 42], stages: [25, 31] },
  { ko: '열대 암초',     en: 'Tropical Reef',        range: [43, 49], stages: [31, 37] },
  { ko: '원양',          en: 'Open Ocean',           range: [50, 56], stages: [37, 43] },
  { ko: '심해',          en: 'Deep Sea',             range: [57, 63], stages: [43, 46] },
  { ko: '보스 해역',     en: 'Boss Area',            range: [64, 70], stages: [47, 50] },
];

export const FISH_CATALOG = [
  // ─── 열대 산호초 (Tropical Coral Reef) ───
  { no: 1,  id: 'clownfish',          nameKo: '흰동가리',     nameEn: 'Clownfish',                 scientificName: 'Amphiprion ocellaris',     regionKo: '열대 산호초', regionEn: 'Tropical Coral Reef', unlockStage: 1, gradeKo: '소형 관상어',   gradeEn: 'Small ornamental fish',   reward: 120 },
  { no: 2,  id: 'blue_damselfish',    nameKo: '파랑돔',       nameEn: 'Blue damselfish',           scientificName: 'Pomacentrus coelestis',    regionKo: '열대 산호초', regionEn: 'Tropical Coral Reef', unlockStage: 1, gradeKo: '소형 열대어',   gradeEn: 'Small tropical fish',     reward: 150 },
  { no: 3,  id: 'butterflyfish',      nameKo: '나비고기',     nameEn: 'Butterflyfish',             scientificName: 'Chaetodon spp.',           regionKo: '열대 산호초', regionEn: 'Tropical Coral Reef', unlockStage: 2, gradeKo: '소형 관상어',   gradeEn: 'Small ornamental fish',   reward: 200 },
  { no: 4,  id: 'mandarinfish',       nameKo: '만다린피쉬',   nameEn: 'Mandarinfish',              scientificName: 'Synchiropus splendidus',   regionKo: '열대 산호초', regionEn: 'Tropical Coral Reef', unlockStage: 2, gradeKo: '희귀 관상어',   gradeEn: 'Rare ornamental fish',    reward: 270 },
  { no: 5,  id: 'blue_tang',          nameKo: '블루탱',       nameEn: 'Blue tang',                 scientificName: 'Paracanthurus hepatus',    regionKo: '열대 산호초', regionEn: 'Tropical Coral Reef', unlockStage: 3, gradeKo: '인기 관상어',   gradeEn: 'Popular ornamental fish', reward: 360 },
  { no: 6,  id: 'angelfish',          nameKo: '엔젤피쉬',     nameEn: 'Marine angelfish',          scientificName: 'Pomacanthus spp.',         regionKo: '열대 산호초', regionEn: 'Tropical Coral Reef', unlockStage: 3, gradeKo: '고급 관상어',   gradeEn: 'Premium ornamental fish', reward: 460 },
  { no: 7,  id: 'lionfish',           nameKo: '쏠배감펭',     nameEn: 'Lionfish',                  scientificName: 'Pterois volitans',         regionKo: '열대 산호초', regionEn: 'Tropical Coral Reef', unlockStage: 4, gradeKo: '위험 관상어',   gradeEn: 'Venomous ornamental fish', reward: 600 },

  // ─── 연안 방파제 (Coastal Breakwater) ───
  { no: 8,  id: 'halfbeak',           nameKo: '학공치',       nameEn: 'Halfbeak',                  scientificName: 'Hyporhamphus sajori',      regionKo: '연안 방파제', regionEn: 'Coastal Breakwater', unlockStage: 4, gradeKo: '소형 연안어',   gradeEn: 'Small coastal fish',      reward: 750 },
  { no: 9,  id: 'horse_mackerel',     nameKo: '전갱이',       nameEn: 'Japanese horse mackerel',   scientificName: 'Trachurus japonicus',      regionKo: '연안 방파제', regionEn: 'Coastal Breakwater', unlockStage: 5, gradeKo: '소형 회유어',   gradeEn: 'Small migratory fish',    reward: 900 },
  { no: 10, id: 'mackerel',           nameKo: '고등어',       nameEn: 'Chub mackerel',             scientificName: 'Scomber japonicus',        regionKo: '연안 방파제', regionEn: 'Coastal Breakwater', unlockStage: 5, gradeKo: '중소형 회유어', gradeEn: 'Small-medium migratory fish', reward: 1050 },
  { no: 11, id: 'filefish',           nameKo: '쥐치',         nameEn: 'Threadsail filefish',       scientificName: 'Stephanolepis cirrhifer',  regionKo: '연안 방파제', regionEn: 'Coastal Breakwater', unlockStage: 6, gradeKo: '중소형 암초어', gradeEn: 'Small-medium reef fish',  reward: 1250 },
  { no: 12, id: 'darkbanded_rockfish', nameKo: '볼락',        nameEn: 'Dark-banded rockfish',      scientificName: 'Sebastes inermis',         regionKo: '연안 방파제', regionEn: 'Coastal Breakwater', unlockStage: 6, gradeKo: '중소형 연안어', gradeEn: 'Small-medium coastal fish', reward: 1450 },
  { no: 13, id: 'mullet',             nameKo: '숭어',         nameEn: 'Flathead grey mullet',      scientificName: 'Mugil cephalus',           regionKo: '연안 방파제', regionEn: 'Coastal Breakwater', unlockStage: 7, gradeKo: '중형 연안어',   gradeEn: 'Medium coastal fish',     reward: 1700 },
  { no: 14, id: 'hairtail',           nameKo: '갈치',         nameEn: 'Largehead hairtail',        scientificName: 'Trichiurus lepturus',      regionKo: '연안 방파제', regionEn: 'Coastal Breakwater', unlockStage: 8, gradeKo: '중형 야간어',   gradeEn: 'Medium nocturnal fish',   reward: 2000 },

  // ─── 모래바닥 해역 (Sandy Bottom Waters) ───
  { no: 15, id: 'japanese_whiting',   nameKo: '보리멸',       nameEn: 'Japanese whiting',          scientificName: 'Sillago japonica',         regionKo: '모래바닥 해역', regionEn: 'Sandy Bottom Waters', unlockStage: 8,  gradeKo: '소형 바닥어',   gradeEn: 'Small bottom fish',       reward: 2300 },
  { no: 16, id: 'finespotted_flounder', nameKo: '도다리',     nameEn: 'Finespotted flounder',      scientificName: 'Pleuronichthys cornutus',  regionKo: '모래바닥 해역', regionEn: 'Sandy Bottom Waters', unlockStage: 9,  gradeKo: '중형 바닥어',   gradeEn: 'Medium bottom fish',      reward: 2600 },
  { no: 17, id: 'righteye_flounder',  nameKo: '가자미',       nameEn: 'Flounder',                  scientificName: 'Pleuronectidae spp.',      regionKo: '모래바닥 해역', regionEn: 'Sandy Bottom Waters', unlockStage: 10, gradeKo: '중형 바닥어',   gradeEn: 'Medium bottom fish',      reward: 2900 },
  { no: 18, id: 'olive_flounder',     nameKo: '광어',         nameEn: 'Olive flounder',            scientificName: 'Paralichthys olivaceus',   regionKo: '모래바닥 해역', regionEn: 'Sandy Bottom Waters', unlockStage: 10, gradeKo: '중형 바닥어',   gradeEn: 'Medium bottom fish',      reward: 3300 },
  { no: 19, id: 'bastard_halibut',    nameKo: '넙치',         nameEn: 'Bastard halibut',           scientificName: 'Paralichthys olivaceus',   regionKo: '모래바닥 해역', regionEn: 'Sandy Bottom Waters', unlockStage: 11, gradeKo: '중대형 바닥어', gradeEn: 'Medium-large bottom fish', reward: 3700, note: '광어(18)와 동일 종(Paralichthys olivaceus). 문서상 별도 항목.' },
  { no: 20, id: 'skate',              nameKo: '홍어',         nameEn: 'Mottled skate',             scientificName: 'Beringraja pulchra',       regionKo: '모래바닥 해역', regionEn: 'Sandy Bottom Waters', unlockStage: 12, gradeKo: '중대형 바닥어', gradeEn: 'Medium-large bottom fish', reward: 4100, note: '교차검증 보정: 프리미엄 홍어(참홍어)=Beringraja pulchra(~115cm, 중대형 일치). 시장 통칭 홍어로 팔리는 소형 간재미는 Okamejei kenojei(별종).' },
  { no: 21, id: 'halibut',            nameKo: '할리벳',       nameEn: 'Pacific halibut',           scientificName: 'Hippoglossus stenolepis',  regionKo: '모래바닥 해역', regionEn: 'Sandy Bottom Waters', unlockStage: 13, gradeKo: '대형 바닥어',   gradeEn: 'Large bottom fish',       reward: 4600 },

  // ─── 갯바위/암초 (Rocky Shore/Reef) ───
  { no: 22, id: 'greenling',          nameKo: '노래미',       nameEn: 'Spotty-bellied greenling',  scientificName: 'Hexagrammos agrammus',     regionKo: '갯바위/암초', regionEn: 'Rocky Shore/Reef', unlockStage: 13, gradeKo: '중소형 암초어', gradeEn: 'Small-medium reef fish',  reward: 5000, note: '교차검증 보정: FishBase 종 정확명. 유사종 쥐노래미=Hexagrammos otakii(별종).' },
  { no: 23, id: 'korean_rockfish',    nameKo: '우럭',         nameEn: 'Korean rockfish',           scientificName: 'Sebastes schlegelii',      regionKo: '갯바위/암초', regionEn: 'Rocky Shore/Reef', unlockStage: 14, gradeKo: '중형 암초어',   gradeEn: 'Medium reef fish',        reward: 5500 },
  { no: 24, id: 'black_sea_bream',    nameKo: '감성돔',       nameEn: 'Black sea bream',           scientificName: 'Acanthopagrus schlegelii', regionKo: '갯바위/암초', regionEn: 'Rocky Shore/Reef', unlockStage: 15, gradeKo: '중형 고급어',   gradeEn: 'Medium prized fish',      reward: 6000 },
  { no: 25, id: 'largescale_blackfish', nameKo: '벵에돔',     nameEn: 'Largescale blackfish',      scientificName: 'Girella punctata',         regionKo: '갯바위/암초', regionEn: 'Rocky Shore/Reef', unlockStage: 16, gradeKo: '중형 갯바위어', gradeEn: 'Medium rocky-shore fish', reward: 6600 },
  { no: 26, id: 'red_seabream',       nameKo: '참돔',         nameEn: 'Red seabream',              scientificName: 'Pagrus major',             regionKo: '갯바위/암초', regionEn: 'Rocky Shore/Reef', unlockStage: 17, gradeKo: '중대형 고급어', gradeEn: 'Medium-large prized fish', reward: 7300 },
  { no: 27, id: 'striped_beakfish',   nameKo: '돌돔',         nameEn: 'Striped beakfish',          scientificName: 'Oplegnathus fasciatus',    regionKo: '갯바위/암초', regionEn: 'Rocky Shore/Reef', unlockStage: 18, gradeKo: '중대형 희귀어', gradeEn: 'Medium-large rare fish',  reward: 8100 },
  { no: 28, id: 'sawedged_perch',     nameKo: '다금바리',     nameEn: 'Sawedged perch',            scientificName: 'Niphon spinosus',          regionKo: '갯바위/암초', regionEn: 'Rocky Shore/Reef', unlockStage: 19, gradeKo: '대형 희귀어',   gradeEn: 'Large rare fish',         reward: 9000, note: '시장 통칭 다금바리는 자바리(Epinephelus bruneus, longtooth grouper)를 가리키기도 함.' },

  // ─── 동아시아 연안 (East Asia Coastal) ───
  { no: 29, id: 'sea_bass',           nameKo: '농어',         nameEn: 'Japanese sea bass',         scientificName: 'Lateolabrax japonicus',    regionKo: '동아시아 연안', regionEn: 'East Asia Coastal', unlockStage: 19, gradeKo: '중형 포식어',   gradeEn: 'Medium predator fish',    reward: 9800 },
  { no: 30, id: 'brown_croaker',      nameKo: '민어',         nameEn: 'Brown croaker',             scientificName: 'Miichthys miiuy',          regionKo: '동아시아 연안', regionEn: 'East Asia Coastal', unlockStage: 20, gradeKo: '중대형 고급어', gradeEn: 'Medium-large prized fish', reward: 10600 },
  { no: 31, id: 'yellow_croaker',     nameKo: '조기',         nameEn: 'Small yellow croaker',      scientificName: 'Larimichthys polyactis',   regionKo: '동아시아 연안', regionEn: 'East Asia Coastal', unlockStage: 21, gradeKo: '중형 식용어',   gradeEn: 'Medium food fish',        reward: 11400 },
  { no: 32, id: 'spanish_mackerel',   nameKo: '삼치',         nameEn: 'Japanese Spanish mackerel', scientificName: 'Scomberomorus niphonius',  regionKo: '동아시아 연안', regionEn: 'East Asia Coastal', unlockStage: 22, gradeKo: '중대형 회유어', gradeEn: 'Medium-large migratory fish', reward: 12300 },
  { no: 33, id: 'yellowtail',         nameKo: '방어',         nameEn: 'Japanese amberjack',        scientificName: 'Seriola quinqueradiata',   regionKo: '동아시아 연안', regionEn: 'East Asia Coastal', unlockStage: 23, gradeKo: '대형 회유어',   gradeEn: 'Large migratory fish',    reward: 13300 },
  { no: 34, id: 'goldstriped_amberjack', nameKo: '부시리',    nameEn: 'Goldstriped amberjack',     scientificName: 'Seriola lalandi',          regionKo: '동아시아 연안', regionEn: 'East Asia Coastal', unlockStage: 24, gradeKo: '대형 파워어',   gradeEn: 'Large power fighter',     reward: 14300 },
  { no: 35, id: 'tilefish',           nameKo: '옥돔',         nameEn: 'Red tilefish',              scientificName: 'Branchiostegus japonicus', regionKo: '동아시아 연안', regionEn: 'East Asia Coastal', unlockStage: 25, gradeKo: '고급 희귀어',   gradeEn: 'Premium rare fish',       reward: 15500 },

  // ─── 한류 해역 (Cold Current Waters) ───
  { no: 36, id: 'pollock',            nameKo: '명태',         nameEn: 'Alaska pollock',            scientificName: 'Gadus chalcogrammus',      regionKo: '한류 해역', regionEn: 'Cold Current Waters', unlockStage: 25, gradeKo: '중형 한랭어',   gradeEn: 'Medium cold-water fish',  reward: 16500 },
  { no: 37, id: 'pacific_cod',        nameKo: '대구',         nameEn: 'Pacific cod',               scientificName: 'Gadus macrocephalus',      regionKo: '한류 해역', regionEn: 'Cold Current Waters', unlockStage: 26, gradeKo: '대형 한랭어',   gradeEn: 'Large cold-water fish',   reward: 17500 },
  { no: 38, id: 'atka_mackerel',      nameKo: '임연수어',     nameEn: 'Atka mackerel',             scientificName: 'Pleurogrammus azonus',     regionKo: '한류 해역', regionEn: 'Cold Current Waters', unlockStage: 27, gradeKo: '중형 한랭어',   gradeEn: 'Medium cold-water fish',  reward: 18600 },
  { no: 39, id: 'herring',            nameKo: '청어',         nameEn: 'Pacific herring',           scientificName: 'Clupea pallasii',          regionKo: '한류 해역', regionEn: 'Cold Current Waters', unlockStage: 28, gradeKo: '중형 회유어',   gradeEn: 'Medium migratory fish',   reward: 19700 },
  { no: 40, id: 'sablefish',          nameKo: '은대구',       nameEn: 'Sablefish',                 scientificName: 'Anoplopoma fimbria',       regionKo: '한류 해역', regionEn: 'Cold Current Waters', unlockStage: 29, gradeKo: '대형 고급어',   gradeEn: 'Large prized fish',       reward: 20800, note: '영어 black cod 로도 불림.' },
  { no: 41, id: 'lingcod',            nameKo: '링코드',       nameEn: 'Lingcod',                   scientificName: 'Ophiodon elongatus',       regionKo: '한류 해역', regionEn: 'Cold Current Waters', unlockStage: 30, gradeKo: '대형 포식어',   gradeEn: 'Large predator fish',     reward: 22000 },
  { no: 42, id: 'greenland_halibut',  nameKo: '그린란드 할리벳', nameEn: 'Greenland halibut',      scientificName: 'Reinhardtius hippoglossoides', regionKo: '한류 해역', regionEn: 'Cold Current Waters', unlockStage: 31, gradeKo: '대형 심해성 한류어', gradeEn: 'Large deep cold-current fish', reward: 23300 },

  // ─── 열대 암초 (Tropical Reef) ───
  { no: 43, id: 'parrotfish',         nameKo: '비늘돔',       nameEn: 'Parrotfish',                scientificName: 'Scaridae spp.',            regionKo: '열대 암초', regionEn: 'Tropical Reef', unlockStage: 31, gradeKo: '중형 열대어',   gradeEn: 'Medium tropical fish',    reward: 24500 },
  { no: 44, id: 'humphead_wrasse',    nameKo: '나폴레옹피쉬', nameEn: 'Humphead wrasse',           scientificName: 'Cheilinus undulatus',      regionKo: '열대 암초', regionEn: 'Tropical Reef', unlockStage: 32, gradeKo: '대형 희귀어',   gradeEn: 'Large rare fish',         reward: 25700, note: 'Napoleon wrasse 로도 불림.' },
  { no: 45, id: 'moray_eel',          nameKo: '곰치',         nameEn: 'Moray eel',                 scientificName: 'Gymnothorax spp.',         regionKo: '열대 암초', regionEn: 'Tropical Reef', unlockStage: 33, gradeKo: '중대형 암초 포식어', gradeEn: 'Medium-large reef predator', reward: 27000 },
  { no: 46, id: 'pufferfish',         nameKo: '복어',         nameEn: 'Pufferfish',                scientificName: 'Takifugu spp.',            regionKo: '열대 암초', regionEn: 'Tropical Reef', unlockStage: 34, gradeKo: '특수 위험어',   gradeEn: 'Special venomous fish',   reward: 28300 },
  { no: 47, id: 'barracuda',          nameKo: '바라쿠다',     nameEn: 'Barracuda',                 scientificName: 'Sphyraena spp.',           regionKo: '열대 암초', regionEn: 'Tropical Reef', unlockStage: 35, gradeKo: '대형 포식어',   gradeEn: 'Large predator fish',     reward: 29700 },
  { no: 48, id: 'grouper',            nameKo: '그루퍼',       nameEn: 'Grouper',                   scientificName: 'Epinephelus spp.',         regionKo: '열대 암초', regionEn: 'Tropical Reef', unlockStage: 36, gradeKo: '대형 암초어',   gradeEn: 'Large reef fish',         reward: 31200 },
  { no: 49, id: 'giant_trevally',     nameKo: '자이언트 트레발리', nameEn: 'Giant trevally',        scientificName: 'Caranx ignobilis',         regionKo: '열대 암초', regionEn: 'Tropical Reef', unlockStage: 37, gradeKo: '대형 스포츠피시', gradeEn: 'Large sportfish',         reward: 32800 },

  // ─── 원양 (Open Ocean) ───
  { no: 50, id: 'mahi_mahi',          nameKo: '만새기',       nameEn: 'Mahi-mahi',                 scientificName: 'Coryphaena hippurus',      regionKo: '원양', regionEn: 'Open Ocean', unlockStage: 37, gradeKo: '대형 열대 원양어', gradeEn: 'Large tropical pelagic fish', reward: 34000, note: 'Common dolphinfish.' },
  { no: 51, id: 'skipjack_tuna',      nameKo: '가다랑어',     nameEn: 'Skipjack tuna',             scientificName: 'Katsuwonus pelamis',       regionKo: '원양', regionEn: 'Open Ocean', unlockStage: 38, gradeKo: '대형 회유어',   gradeEn: 'Large migratory fish',    reward: 35200 },
  { no: 52, id: 'yellowfin_tuna',     nameKo: '황다랑어',     nameEn: 'Yellowfin tuna',            scientificName: 'Thunnus albacares',        regionKo: '원양', regionEn: 'Open Ocean', unlockStage: 39, gradeKo: '대형 원양어',   gradeEn: 'Large pelagic fish',      reward: 36500 },
  { no: 53, id: 'bigeye_tuna',        nameKo: '눈다랑어',     nameEn: 'Bigeye tuna',               scientificName: 'Thunnus obesus',           regionKo: '원양', regionEn: 'Open Ocean', unlockStage: 40, gradeKo: '대형 희귀어',   gradeEn: 'Large rare fish',         reward: 37800 },
  { no: 54, id: 'bluefin_tuna',       nameKo: '참다랑어',     nameEn: 'Pacific bluefin tuna',      scientificName: 'Thunnus orientalis',       regionKo: '원양', regionEn: 'Open Ocean', unlockStage: 41, gradeKo: '초대형 원양어', gradeEn: 'Huge pelagic fish',       reward: 39200 },
  { no: 55, id: 'sailfish',           nameKo: '돛새치',       nameEn: 'Sailfish',                  scientificName: 'Istiophorus platypterus',  regionKo: '원양', regionEn: 'Open Ocean', unlockStage: 42, gradeKo: '초대형 속도형 어종', gradeEn: 'Huge speed-type fish', reward: 40700 },
  { no: 56, id: 'striped_marlin',     nameKo: '청새치',       nameEn: 'Striped marlin',            scientificName: 'Kajikia audax',            regionKo: '원양', regionEn: 'Open Ocean', unlockStage: 43, gradeKo: '전설급 스포츠피시', gradeEn: 'Legendary sportfish',  reward: 42300 },

  // ─── 심해 (Deep Sea) ───
  { no: 57, id: 'anglerfish',         nameKo: '아귀',         nameEn: 'Anglerfish',                scientificName: 'Lophius litulon',          regionKo: '심해', regionEn: 'Deep Sea', unlockStage: 43, gradeKo: '심해 포식어',   gradeEn: 'Deep-sea predator',       reward: 43300, note: 'Yellow goosefish / monkfish.' },
  { no: 58, id: 'chimaera',           nameKo: '은상어',       nameEn: 'Silver chimaera',           scientificName: 'Chimaera phantasma',       regionKo: '심해', regionEn: 'Deep Sea', unlockStage: 44, gradeKo: '심해 희귀어',   gradeEn: 'Deep-sea rare fish',      reward: 44000, note: 'Ratfish 류.' },
  { no: 59, id: 'barreleye',          nameKo: '데메니기스',   nameEn: 'Barreleye',                 scientificName: 'Macropinna microstoma',    regionKo: '심해', regionEn: 'Deep Sea', unlockStage: 44, gradeKo: '심해 희귀어',   gradeEn: 'Deep-sea rare fish',      reward: 44700 },
  { no: 60, id: 'black_dragonfish',   nameKo: '블랙드래곤피쉬', nameEn: 'Pacific blackdragon',     scientificName: 'Idiacanthus antrostomus',  regionKo: '심해', regionEn: 'Deep Sea', unlockStage: 45, gradeKo: '심해 희귀어',   gradeEn: 'Deep-sea rare fish',      reward: 45400, note: '교차검증 보정: I. antrostomus 종 정확명은 Pacific blackdragon. 통칭 "Black dragonfish"는 대서양종 I. fasciola.' },
  { no: 61, id: 'viperfish',          nameKo: '바이퍼피쉬',   nameEn: 'Viperfish',                 scientificName: 'Chauliodus sloani',        regionKo: '심해', regionEn: 'Deep Sea', unlockStage: 45, gradeKo: '심해 포식어',   gradeEn: 'Deep-sea predator',       reward: 46100 },
  { no: 62, id: 'frilled_shark',      nameKo: '주름상어',     nameEn: 'Frilled shark',             scientificName: 'Chlamydoselachus anguineus', regionKo: '심해', regionEn: 'Deep Sea', unlockStage: 46, gradeKo: '심해 상어',     gradeEn: 'Deep-sea shark',          reward: 46800 },
  { no: 63, id: 'goblin_shark',       nameKo: '마귀상어',     nameEn: 'Goblin shark',              scientificName: 'Mitsukurina owstoni',      regionKo: '심해', regionEn: 'Deep Sea', unlockStage: 46, gradeKo: '심해 희귀 상어', gradeEn: 'Deep-sea rare shark',    reward: 47500 },

  // ─── 보스 해역 (Boss Area) ───
  { no: 64, id: 'hammerhead_shark',   nameKo: '귀상어',       nameEn: 'Hammerhead shark',          scientificName: 'Sphyrna lewini',           regionKo: '보스 해역', regionEn: 'Boss Area', unlockStage: 47, gradeKo: '대형 상어',     gradeEn: 'Large shark',             reward: 48000 },
  { no: 65, id: 'mako_shark',         nameKo: '청상아리',     nameEn: 'Shortfin mako shark',       scientificName: 'Isurus oxyrinchus',        regionKo: '보스 해역', regionEn: 'Boss Area', unlockStage: 47, gradeKo: '초대형 상어',   gradeEn: 'Huge shark',              reward: 48400 },
  { no: 66, id: 'great_white_shark',  nameKo: '백상아리',     nameEn: 'Great white shark',         scientificName: 'Carcharodon carcharias',   regionKo: '보스 해역', regionEn: 'Boss Area', unlockStage: 48, gradeKo: '보스급 상어',   gradeEn: 'Boss-tier shark',         reward: 48800 },
  { no: 67, id: 'manta_ray',          nameKo: '만타가오리',   nameEn: 'Manta ray',                 scientificName: 'Mobula birostris',         regionKo: '보스 해역', regionEn: 'Boss Area', unlockStage: 48, gradeKo: '초대형 가오리', gradeEn: 'Huge ray',                reward: 49100 },
  { no: 68, id: 'whale_shark',        nameKo: '고래상어',     nameEn: 'Whale shark',               scientificName: 'Rhincodon typus',          regionKo: '보스 해역', regionEn: 'Boss Area', unlockStage: 49, gradeKo: '최대급 어류',   gradeEn: 'Largest-class fish',      reward: 49400 },
  { no: 69, id: 'orca',               nameKo: '범고래',       nameEn: 'Orca',                      scientificName: 'Orcinus orca',             regionKo: '보스 해역', regionEn: 'Boss Area', unlockStage: 49, gradeKo: '보스 해양생물', gradeEn: 'Boss marine animal',      reward: 49700, note: 'Killer whale (포유류).' },
  { no: 70, id: 'humpback_whale',     nameKo: '혹등고래',     nameEn: 'Humpback whale',            scientificName: 'Megaptera novaeangliae',   regionKo: '보스 해역', regionEn: 'Boss Area', unlockStage: 50, gradeKo: '최상위 보스 해양생물', gradeEn: 'Apex boss marine animal', reward: 50000, note: '포유류.' },
];

// ─── 70종 게임플레이 데이터 (사이즈 + 점수) ───
//   FISH_CATALOG 의 70종에 대해 실제 평균 사이즈(realLengthCm)와 게임 score 를 보완.
//   추후 fish.config.js 의 RAW_SPECIES 확장 시 사용.
//
// realLengthCm 산출:
//   각 종의 학명(scientificName) 기준 성체 평균 크기 (FishBase 등 공개 데이터 참조).
//   대형 보스류(>400cm) 는 deriveSize 가 자동 clamp → 표시 px 동일 (게임 시각 일관성).
//
// score 산출 공식:
//   base = round((sqrt(min(realLengthCm, 400)) - 2.5) × 80 + 100)
//   희귀도 보정: 평범한 식용/관상어 base 유지, 희귀/보스급은 +20~50% 가산.
//   범위: 130(blue_damselfish 8cm) ~ 1600(boss 400cm+).
//
// 그룹 (FISH_CATALOG_REGIONS 대응):
//   1-7: 열대 산호초 / 8-14: 연안 방파제 / 15-21: 모래바닥
//   22-28: 갯바위/암초 / 29-35: 동아시아 연안 / 36-42: 한류
//   43-49: 열대 암초 / 50-56: 원양 / 57-63: 심해 / 64-70: 보스
/**
 * @typedef {Object} CatalogGameplayData
 * @property {number} realLengthCm   성체 평균 길이 (cm)
 * @property {number} score          게임 점수 (HP = score + size_px)
 * @property {string} [note]         사이즈 산출 근거
 */
/** @type {Object<string, CatalogGameplayData>} */
export const FISH_CATALOG_GAMEPLAY = {
  // ── 1-7 열대 산호초 ──
  clownfish:           { realLengthCm:  10, score:  150, note: 'Amphiprion ocellaris 8-11cm' },
  blue_damselfish:     { realLengthCm:   8, score:  130, note: 'Pomacentrus coelestis 5-9cm' },
  butterflyfish:       { realLengthCm:  15, score:  210, note: 'Chaetodon spp. 12-20cm' },
  mandarinfish:        { realLengthCm:   6, score:  180, note: 'S. splendidus 5-8cm — 희귀↑' },
  blue_tang:           { realLengthCm:  28, score:  320, note: 'P. hepatus 25-31cm' },
  angelfish:           { realLengthCm:  30, score:  380, note: 'Pomacanthus spp. 25-40cm' },
  lionfish:            { realLengthCm:  35, score:  450, note: 'P. volitans 30-38cm — 독성↑' },

  // ── 8-14 연안 방파제 ──
  halfbeak:            { realLengthCm:  30, score:  340, note: 'H. sajori 25-35cm' },
  horse_mackerel:      { realLengthCm:  40, score:  410, note: 'T. japonicus 30-50cm' },
  mackerel:            { realLengthCm:  50, score:  480, note: 'S. japonicus 30-60cm' },
  filefish:            { realLengthCm:  22, score:  280, note: 'S. cirrhifer 15-25cm' },
  darkbanded_rockfish: { realLengthCm:  30, score:  360, note: 'S. inermis 20-35cm' },
  mullet:              { realLengthCm:  50, score:  500, note: 'M. cephalus 30-60cm' },
  hairtail:            { realLengthCm: 120, score:  820, note: 'T. lepturus 100-150cm — 대형 회유' },

  // ── 15-21 모래바닥 해역 ──
  japanese_whiting:    { realLengthCm:  30, score:  340, note: 'S. japonica 25-35cm' },
  finespotted_flounder:{ realLengthCm:  40, score:  430, note: 'P. cornutus 30-50cm' },
  righteye_flounder:   { realLengthCm:  45, score:  470, note: 'Pleuronectidae 30-55cm' },
  olive_flounder:      { realLengthCm:  80, score:  680, note: 'P. olivaceus 50-90cm' },
  bastard_halibut:     { realLengthCm:  90, score:  730, note: 'P. olivaceus 큰 개체 (광어 별칭)' },
  skate:               { realLengthCm: 115, score:  830, note: 'B. pulchra 80-130cm 참홍어' },
  halibut:             { realLengthCm: 180, score: 1020, note: 'H. stenolepis 100-200cm 대형 비목' },

  // ── 22-28 갯바위/암초 ──
  greenling:           { realLengthCm:  35, score:  420, note: 'H. agrammus 25-40cm' },
  korean_rockfish:     { realLengthCm:  40, score:  480, note: 'S. schlegelii 30-50cm 우럭' },
  black_sea_bream:     { realLengthCm:  50, score:  560, note: 'A. schlegelii 30-60cm 감성돔' },
  largescale_blackfish:{ realLengthCm:  50, score:  570, note: 'G. punctata 40-60cm 벵에돔' },
  red_seabream:        { realLengthCm:  80, score:  730, note: 'P. major 50-100cm 참돔' },
  striped_beakfish:    { realLengthCm:  50, score:  620, note: 'O. fasciatus 40-60cm 돌돔 — 희귀↑' },
  sawedged_perch:      { realLengthCm: 100, score:  870, note: 'N. spinosus 80-120cm 다금바리 — 희귀↑↑' },

  // ── 29-35 동아시아 연안 ──
  sea_bass:            { realLengthCm:  80, score:  720, note: 'L. japonicus 60-90cm 농어' },
  brown_croaker:       { realLengthCm:  90, score:  790, note: 'M. miiuy 70-110cm 민어' },
  yellow_croaker:      { realLengthCm:  25, score:  310, note: 'L. polyactis 20-30cm 조기' },
  spanish_mackerel:    { realLengthCm: 100, score:  830, note: 'S. niphonius 80-120cm 삼치' },
  yellowtail:          { realLengthCm: 100, score:  890, note: 'S. quinqueradiata 80-120cm 방어' },
  goldstriped_amberjack:{ realLengthCm: 180, score: 1110, note: 'S. lalandi 150-250cm 부시리 대형' },
  tilefish:            { realLengthCm:  50, score:  580, note: 'B. japonicus 40-60cm 옥돔 — 고급↑' },

  // ── 36-42 한류 해역 ──
  pollock:             { realLengthCm:  60, score:  620, note: 'G. chalcogrammus 50-70cm 명태' },
  pacific_cod:         { realLengthCm: 100, score:  840, note: 'G. macrocephalus 80-120cm 대구' },
  atka_mackerel:       { realLengthCm:  50, score:  530, note: 'P. azonus 40-60cm 임연수어' },
  herring:             { realLengthCm:  35, score:  420, note: 'C. pallasii 30-40cm 청어' },
  sablefish:           { realLengthCm: 100, score:  870, note: 'A. fimbria 70-110cm 은대구 — 고급↑' },
  lingcod:             { realLengthCm: 130, score:  960, note: 'O. elongatus 100-150cm' },
  greenland_halibut:   { realLengthCm: 110, score:  920, note: 'R. hippoglossoides 90-130cm' },

  // ── 43-49 열대 암초 ──
  parrotfish:          { realLengthCm:  50, score:  570, note: 'Scaridae 30-90cm' },
  humphead_wrasse:     { realLengthCm: 180, score: 1180, note: 'C. undulatus 150-230cm 나폴레옹 — 희귀' },
  moray_eel:           { realLengthCm: 150, score:  990, note: 'Gymnothorax 100-200cm 곰치 — 포식' },
  pufferfish:          { realLengthCm:  35, score:  450, note: 'Takifugu 25-45cm 복어 — 독성↑' },
  barracuda:           { realLengthCm: 150, score: 1020, note: 'Sphyraena 80-180cm 바라쿠다' },
  grouper:             { realLengthCm: 130, score:  990, note: 'Epinephelus 100-160cm 그루퍼' },
  giant_trevally:      { realLengthCm: 170, score: 1140, note: 'C. ignobilis 140-180cm 스포츠피시' },

  // ── 50-56 원양 ──
  mahi_mahi:           { realLengthCm: 150, score: 1090, note: 'C. hippurus 100-200cm 만새기' },
  skipjack_tuna:       { realLengthCm:  80, score:  790, note: 'K. pelamis 60-100cm 가다랑어' },
  yellowfin_tuna:      { realLengthCm: 180, score: 1190, note: 'T. albacares 150-220cm 황다랑어' },
  bigeye_tuna:         { realLengthCm: 200, score: 1240, note: 'T. obesus 180-230cm 눈다랑어' },
  bluefin_tuna:        { realLengthCm: 280, score: 1430, note: 'T. orientalis 200-300cm 참다랑어 — 초대형' },
  sailfish:            { realLengthCm: 290, score: 1490, note: 'I. platypterus 250-330cm 돛새치 — 속도형' },
  striped_marlin:      { realLengthCm: 320, score: 1560, note: 'K. audax 270-400cm 청새치 — 전설급' },

  // ── 57-63 심해 ──
  anglerfish:          { realLengthCm: 100, score:  890, note: 'L. litulon 80-130cm 아귀' },
  chimaera:            { realLengthCm: 100, score:  910, note: 'C. phantasma 80-120cm 은상어 — 희귀' },
  barreleye:           { realLengthCm:  15, score:  280, note: 'M. microstoma 10-20cm — 매우 희귀↑↑' },
  black_dragonfish:    { realLengthCm:  50, score:  640, note: 'I. antrostomus 40-60cm — 심해 희귀' },
  viperfish:           { realLengthCm:  35, score:  500, note: 'C. sloani 25-40cm 심해 포식' },
  frilled_shark:       { realLengthCm: 180, score: 1230, note: 'C. anguineus 150-200cm 살아있는 화석' },
  goblin_shark:        { realLengthCm: 380, score: 1610, note: 'M. owstoni 300-450cm 마귀상어 — 희귀' },

  // ── 64-70 보스 해역 ──
  hammerhead_shark:    { realLengthCm: 400, score: 1700, note: 'S. lewini 300-450cm 귀상어' },
  mako_shark:          { realLengthCm: 380, score: 1670, note: 'I. oxyrinchus 300-400cm 청상아리' },
  great_white_shark:   { realLengthCm: 450, score: 1750, note: 'C. carcharias 350-600cm 백상아리 (clamp 400cm)' },
  manta_ray:           { realLengthCm: 700, score: 1820, note: 'M. birostris 400-700cm 만타가오리 (날개폭, clamp)' },
  whale_shark:         { realLengthCm: 900, score: 1900, note: 'R. typus 600-1200cm 고래상어 (clamp)' },
  orca:                { realLengthCm: 700, score: 1950, note: 'O. orca 600-900cm 범고래 — 보스급' },
  humpback_whale:      { realLengthCm:1500, score: 2000, note: 'M. novaeangliae 1300-1600cm 혹등고래 — 최상위' },
};

/** id 로 조회. */
export function getCatalogFishById(id) {
  return FISH_CATALOG.find((f) => f.id === id) || null;
}

/** id 로 게임플레이 데이터(realLengthCm + score) 조회. */
export function getCatalogGameplayById(id) {
  return FISH_CATALOG_GAMEPLAY[id] || null;
}

/** 번호(no)로 조회. */
export function getCatalogFishByNo(no) {
  return FISH_CATALOG.find((f) => f.no === no) || null;
}

/** 지역(국문)별 어종 목록. */
export function getCatalogFishByRegion(regionKo) {
  return FISH_CATALOG.filter((f) => f.regionKo === regionKo);
}
