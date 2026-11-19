/**
 * birds.js — 观鸟观测手账的数据源
 *
 * 设计原则：
 *   1. 每条记录都是一个「观测事件」：地点 + 时间 + 天气 + 鸟种 + 数量 + 记录人
 *   2. 稀有度按真实记录频率分级，不另造一套游戏稀有度
 *   3. 地名与鸟种的搭配必须真实，不能凭「这种鸟应该在那里」推测
 *
 * 数据状态：结构已定，具体记录正在核实中（见 docs/research/birding.md）
 * 标注 [待核实] 的条目在核实前不进入正式发布版。
 */

/* ────────────────────────── 稀有度 ────────────────────────── */

export const RARITY = {
  C: { key: 'C', label: '常见', desc: '该地点该季稳定可见', weight: 100, color: '#7c9160' },
  U: { key: 'U', label: '少见', desc: '需要一点运气', weight: 38, color: '#6d8f8a' },
  R: { key: 'R', label: '稀有', desc: '一年只几回', weight: 9, color: '#b8912f' },
  M: { key: 'M', label: '迷鸟', desc: '迷鸟，记录稀少', weight: 1.6, color: '#b1813f' },
  X: { key: 'X', label: '极罕', desc: '传说级，极难遇见', weight: 0.18, color: '#9d3a30' },
};

/* ────────────────────────── 地点 ────────────────────────── */

export const SITES = [
  {
    id: 'jiulongshan',
    name: '九龙山',
    region: '嘉兴平湖',
    kind: '丘陵',
    alt: '海拔 161m',
    note: '乍浦镇的海边丘陵，浙江秋天看猛禽最集中的地方。丘陵起伏，白天生出上升气流，鸟贴着这条线一批一批往南。',
    seasons: ['秋'],
    best: '十月中旬',
    scene: 'ridge',
    species: [
      { s: '灰脸鵟鹰', en: 'Grey-faced Buzzard', r: 'C', n: '数千只', tip: '过境主力，占九成。脸颊灰色，迁徙时结大群盘旋' },
      { s: '凤头蜂鹰', en: 'Crested Honey Buzzard', r: 'U', n: '数百只', tip: '头小颈长，翅膀宽，爱在上升气流里打转' },
      { s: '日本松雀鹰', en: 'Japanese Sparrowhawk', r: 'U', n: '数十只', tip: '体型小，扇翅快，掠过时像一道影子' },
      { s: '赤腹鹰', en: 'Chinese Sparrowhawk', r: 'U', n: '数只', tip: '翼尖黑色。雄鸟胸腹栗红，雌鸟偏褐' },
      { s: '蛇雕', en: 'Crested Serpent Eagle', r: 'R', n: '偶见', tip: '翅膀宽圆，翼下有大白斑，常单独盘旋鸣叫' },
      { s: '鹗', en: 'Osprey', r: 'U', n: '数只', tip: '国家二级，海面上盘旋后扎水抓鱼' },
      { s: '游隼', en: 'Peregrine Falcon', r: 'R', n: '偶见', tip: '国家二级，俯冲极快，常在崖边活动' },
      { s: '棕背伯劳', en: 'Long-tailed Shrike', r: 'C', n: '常见', tip: '滨海灌丛和电线上都有，眼罩黑色' },
      { s: '白头鹎', en: 'Light-vented Bulbul', r: 'C', n: '成群', tip: '后脑一块白，低处林缘到处是它的叫声' },
      { s: '白鹭', en: 'Little Egret', r: 'C', n: '常见', tip: '山下河道浅水里慢慢走，黑喙黑腿黄脚' },
      { s: '苍鹭', en: 'Grey Heron', r: 'U', n: '数只', tip: '一动不动站很久，俗称「老等」' },
      { s: '白鹡鸰', en: 'White Wagtail', r: 'U', n: '数只', tip: '尾巴不停上下摆，地面小碎步走' },
    ],
  },
  {
    id: 'qingshanhu',
    name: '青山湖',
    region: '杭州临安',
    kind: '湖沼',
    alt: '湖面',
    note: '水上那片池杉林，秋冬落满候鸟，清晨光斜进来的时候最好看。',
    seasons: ['秋', '冬'],
    best: '十一月末',
    scene: 'lake',
    species: [
      { s: '绿眉鸭', en: 'American Wigeon', r: 'R', n: '1', tip: '北美种，2021 年首次出现在这里，此后连续五年在同一片水域越冬。雄鸟头顶奶白、眼后一道绿' },
      { s: '鸳鸯', en: 'Mandarin Duck', r: 'C', n: '数十只', tip: '雄鸟帆羽醒目，树上也能停，池杉林一带秋冬稳定可见' },
      { s: '普通鸬鹚', en: 'Great Cormorant', r: 'C', n: '成群', tip: '站树桩上晾翅，潜水捕鱼' },
      { s: '白鹭', en: 'Little Egret', r: 'C', n: '常见', tip: '黑喙黑腿黄脚，浅水里慢慢走' },
      { s: '苍鹭', en: 'Grey Heron', r: 'C', n: '数只', tip: '一动不动站很久，俗称「老等」' },
      { s: '中华秋沙鸭', en: 'Scaly-sided Merganser', r: 'R', n: '偶见', tip: '国家一级保护，雄鸟胁部鳞状纹' },
      { s: '东方白鹳', en: 'Oriental Stork', r: 'R', n: '偶见', tip: '国家一级保护，黑白分明的大型涉禽，省林业局名录在册' },
      { s: '白鹡鸰', en: 'White Wagtail', r: 'C', n: '常见', tip: '水库边石头上跳，尾巴上下摆' },
      { s: '小䴙䴘', en: 'Little Grebe', r: 'C', n: '数只', tip: '潜水，受惊直接沉下去不飞' },
      { s: '黑水鸡', en: 'Common Moorhen', r: 'C', n: '常见', tip: '额甲红色，浮水时尾部上下摆' },
      { s: '普通翠鸟', en: 'Common Kingfisher', r: 'U', n: '偶见', tip: '蓝绿闪光，贴水面直线飞' },
      { s: '扇尾沙锥', en: 'Common Snipe', r: 'U', n: '数只', tip: '退水的泥滩上扎下去觅食，惊飞时之字形' },
    ],
  },
  {
    id: 'nanhu',
    name: '南湖公园',
    region: '杭州余杭',
    kind: '湿地农田',
    alt: '平原',
    note: '城市边上的水面和农田混在一起，冬天候鸟落脚，夏天全是鹭。',
    seasons: ['春', '秋', '冬'],
    best: '候鸟过境期',
    scene: 'wetland',
    species: [
      { s: '中华秋沙鸭', en: 'Scaly-sided Merganser', r: 'R', n: '偶见', tip: '国家一级，杭州市林水局记录南湖有分布。雄鸟胁部鳞状纹' },
      { s: '白鹡鸰', en: 'White Wagtail', r: 'C', n: '常见', tip: '尾巴不停上下摆，走路小碎步' },
      { s: '北红尾鸲', en: 'Daurian Redstart', r: 'C', n: '常见', tip: '冬季雄鸟橙腹黑脸白翅斑' },
      { s: '小䴙䴘', en: 'Little Grebe', r: 'C', n: '数只', tip: '潜水，受惊直接沉下去不飞' },
      { s: '扇尾沙锥', en: 'Common Snipe', r: 'U', n: '数只', tip: '泥滩上扎下去觅食，惊飞时之字形' },
      { s: '短耳鸮', en: 'Short-eared Owl', r: 'R', n: '偶见', tip: '黄昏在开阔地低飞，像一只大蛾子' },
      { s: '东方白鹳', en: 'Oriental Stork', r: 'X', n: '极罕见', tip: '国家一级保护，黑白分明的大型涉禽' },
      { s: '白鹭', en: 'Little Egret', r: 'C', n: '常见', tip: '夏天水田里成群，黑喙黑腿黄脚' },
      { s: '苍鹭', en: 'Grey Heron', r: 'C', n: '数只', tip: '水边一站半天，捕到鱼才动' },
      { s: '黑水鸡', en: 'Common Moorhen', r: 'C', n: '常见', tip: '额甲红色，浮水时尾部上下摆' },
      { s: '普通翠鸟', en: 'Common Kingfisher', r: 'U', n: '偶见', tip: '蓝绿闪光，贴水面直线飞' },
      { s: '棕背伯劳', en: 'Long-tailed Shrike', r: 'C', n: '常见', tip: '农田边电线上蹲着，眼罩黑色' },
    ],
  },
  {
    id: 'xixi',
    name: '西溪湿地',
    region: '杭州西湖区',
    kind: '湿地',
    alt: '水网',
    note: '芦苇、柿树、水道，秋冬满树红柿子，鸟在中间穿。',
    seasons: ['秋', '冬', '春'],
    best: '柿子红的时候',
    scene: 'reed',
    species: [
      { s: '白头鹎', en: 'Light-vented Bulbul', r: 'C', n: '极常见', tip: '后脑一块白，城市里到处叫' },
      { s: '棕背伯劳', en: 'Long-tailed Shrike', r: 'C', n: '常见', tip: '眼罩黑色，尾长，喜欢站电线' },
      { s: '黑水鸡', en: 'Common Moorhen', r: 'C', n: '常见', tip: '额甲红色，浮水时尾部上下摆' },
      { s: '普通翠鸟', en: 'Common Kingfisher', r: 'U', n: '偶见', tip: '蓝绿闪光，贴水面直线飞' },
      { s: '震旦鸦雀', en: 'Reed Parrotbill', r: 'R', n: '小群', tip: '芦苇丛里，黄色喙，中国特有属' },
      { s: '白胸翡翠', en: 'White-throated Kingfisher', r: 'R', n: '偶见', tip: '胸腹大片栗红，蓝背' },
      { s: '东方白鹳', en: 'Oriental Stork', r: 'X', n: '极罕见', tip: '国家一级。西溪累计记录到的一级保护鸟类只有 4 种，它是其中之一' },
      { s: '白鹭', en: 'Little Egret', r: 'C', n: '常见', tip: '柿树下的水道边，浅水里慢慢走' },
      { s: '苍鹭', en: 'Grey Heron', r: 'U', n: '数只', tip: '芦苇边上站着不动，捕到鱼才动' },
      { s: '小䴙䴘', en: 'Little Grebe', r: 'C', n: '数只', tip: '水道里潜水，受惊直接沉下去' },
      { s: '北红尾鸲', en: 'Daurian Redstart', r: 'C', n: '常见', tip: '秋冬灌丛高频，雄鸟橙腹黑脸' },
      { s: '棕噪鹛', en: 'Buffy Laughingthrush', r: 'U', n: '小群', tip: '中国特有，灌丛里吵闹集群' },
    ],
  },
  {
    id: 'hangzhouwan',
    name: '杭州湾湿地',
    region: '宁波慈溪',
    kind: '滨海滩涂',
    alt: '滩涂',
    note: '一片一眼望不到边的泥滩，涨潮时鸟全挤到近处，落潮全散开。',
    seasons: ['秋', '冬', '春'],
    best: '涨潮前两小时',
    scene: 'tidal',
    species: [
      { s: '黑脸琵鹭', en: 'Black-faced Spoonbill', r: 'R', n: '数只', tip: '匙状长喙左右扫水，全球濒危' },
      { s: '卷羽鹈鹕', en: 'Dalmatian Pelican', r: 'R', n: '偶见', tip: '体型巨大，成群飞时排成线' },
      { s: '反嘴鹬', en: 'Pied Avocet', r: 'C', n: '成群', tip: '喙上翘，黑白分明，边走边扫' },
      { s: '黑腹滨鹬', en: 'Dunlin', r: 'C', n: '数千只', tip: '滩涂上像流动的云，群体同步转向' },
      { s: '遗鸥', en: 'Relict Gull', r: 'M', n: '罕见', tip: '国家一级保护，繁殖羽头全黑' },
      { s: '黄嘴白鹭', en: 'Chinese Egret', r: 'R', n: '偶见', tip: '喙黄色，繁殖期冠羽蓬松' },
      { s: '东方白鹳', en: 'Oriental Stork', r: 'R', n: '偶见', tip: '国家一级。宁波市资规局湿地名录把它与遗鸥、中华秋沙鸭一并列入' },
      { s: '中华秋沙鸭', en: 'Scaly-sided Merganser', r: 'R', n: '偶见', tip: '国家一级，越冬期在开阔水面活动' },
      { s: '白鹭', en: 'Little Egret', r: 'C', n: '成群', tip: '涨潮时挤到近处的滩上，黑喙黑腿黄脚' },
      { s: '苍鹭', en: 'Grey Heron', r: 'C', n: '成群', tip: '落潮后在泥滩上慢慢走，一站半天' },
      { s: '普通鸬鹚', en: 'Great Cormorant', r: 'U', n: '数只', tip: '排成线低飞过水面，然后集体落下' },
      { s: '鹗', en: 'Osprey', r: 'U', n: '数只', tip: '国家二级，悬停后扎水抓鱼，脚先入水' },
    ],
  },
  {
    id: 'jiushan',
    name: '韭山列岛',
    region: '宁波象山',
    kind: '海岛',
    alt: '礁岩岛',
    note: '海上的一块礁石，每年夏天有一群鸟在这里生蛋，护鸟的人也在。',
    seasons: ['夏'],
    best: '五到八月',
    scene: 'island',
    species: [
      { s: '中华凤头燕鸥', en: 'Chinese Crested Tern', r: 'X', n: '数十只', tip: '黄色喙尖、黑色冠羽，全球极危，被称为「神话之鸟」。2013 到 2025 年这里累计孵出 214 只' },
      { s: '大凤头燕鸥', en: 'Greater Crested Tern', r: 'C', n: '数百只', tip: '与中华凤头燕鸥混群，喙全黄' },
      { s: '黑尾鸥', en: 'Black-tailed Gull', r: 'C', n: '成群', tip: '尾端黑带，叫声像猫' },
      { s: '褐翅燕鸥', en: 'Bridled Tern', r: 'U', n: '数只', tip: '翅上褐色，额部白纹，夜里也叫' },
      { s: '白额鹱', en: 'Streaked Shearwater', r: 'R', n: '偶见', tip: '贴海面滑翔，几乎不扇翅' },
      { s: '岩鹭', en: 'Pacific Reef Heron', r: 'R', n: '偶见', tip: '深灰色型常见，礁石间活动。陆生野生动物重要栖息地名录把它列为主要保护对象' },
      { s: '黄嘴白鹭', en: 'Chinese Egret', r: 'R', n: '偶见', tip: '国家一级。栖息地名录把它与中华凤头燕鸥、岩鹭并列' },
      { s: '黑脸琵鹭', en: 'Black-faced Spoonbill', r: 'R', n: '偶见', tip: '国家一级。环评名录里两个一级种之一' },
      { s: '白鹭', en: 'Little Egret', r: 'C', n: '常见', tip: '礁石边浅水处站着，环评科普材料列为常见种' },
      { s: '鹗', en: 'Osprey', r: 'U', n: '数只', tip: '国家二级，海面上盘旋后扎水抓鱼' },
      { s: '游隼', en: 'Peregrine Falcon', r: 'R', n: '偶见', tip: '国家二级，崖边活动，俯冲极快' },
    ],
  },
  {
    id: 'nanji',
    name: '南麂列岛',
    region: '温州平阳',
    kind: '海岛',
    alt: '列岛',
    note: '贝藻王国，海岛和礁石连成一线，夏季海鸟和过境水鸟都有。',
    seasons: ['春', '夏', '秋'],
    best: '四月与九月',
    scene: 'island',
    species: [
      { s: '黑尾鸥', en: 'Black-tailed Gull', r: 'C', n: '数千只', tip: '下马鞍岛集群繁殖，2026 年环评最高记录 2500 只，我国已知最大繁殖地之一' },
      { s: '大凤头燕鸥', en: 'Greater Crested Tern', r: 'C', n: '数千只', tip: '平屿岛与中华凤头燕鸥混群繁殖，2024 年最多单次 2500 余只、繁殖巢 1350 个' },
      { s: '褐翅燕鸥', en: 'Bridled Tern', r: 'U', n: '数只', tip: '夜间也会叫，繁殖在礁石缝隙' },
      { s: '白额鹱', en: 'Streaked Shearwater', r: 'U', n: '数只', tip: '清晨海面上成列滑翔' },
      { s: '岩鹭', en: 'Pacific Reef Heron', r: 'R', n: '偶见', tip: '环评区域记录的保护鸟类名单里明确列有岩鹭' },
      { s: '鹗', en: 'Osprey', r: 'R', n: '偶见', tip: '悬停后扎水抓鱼，脚先入水' },
      { s: '游隼', en: 'Peregrine Falcon', r: 'R', n: '偶见', tip: '俯冲速度极快，常在崖边' },
      { s: '白鹭', en: 'Little Egret', r: 'C', n: '常见', tip: '环评材料列为保护区优势鸟类之一' },
      { s: '苍鹭', en: 'Grey Heron', r: 'C', n: '数只', tip: '保护区优势鸟类，岸边一站半天' },
      { s: '普通鸬鹚', en: 'Great Cormorant', r: 'U', n: '数只', tip: '岛屿岸边晒翅，环评记录种' },
    ],
  },
  {
    id: 'tianmushan',
    name: '天目山',
    region: '杭州临安',
    kind: '山林',
    alt: '海拔 300-1500m',
    note: '从山脚到山顶，鸟的种类一路在换，走一天能看两个世界。',
    seasons: ['春', '夏', '秋'],
    best: '五月的清晨',
    scene: 'forest',
    species: [
      { s: '白鹇', en: "Silver Pheasant", r: 'U', n: '数只', tip: '雄鸟白黑相间，尾长，林下慢走' },
      { s: '勺鸡', en: 'Koklass Pheasant', r: 'R', n: '偶见', tip: '叫声像拉锯，藏在灌丛' },
      { s: '红嘴蓝鹊', en: 'Red-billed Blue Magpie', r: 'C', n: '成群', tip: '长尾拖曳，飞行时呈波浪状' },
      { s: '棕噪鹛', en: 'Buffy Laughingthrush', r: 'U', n: '小群', tip: '中国特有，高海拔灌丛里吵闹，天目山是它分布的南缘' },
      { s: '白颈长尾雉', en: "Elliot's Pheasant", r: 'R', n: '偶见', tip: '中国特有种，国家一级保护' },
      { s: '仙八色鸫', en: 'Fairy Pitta', r: 'X', n: '极罕见', tip: '八种颜色，迁徙季短暂停留。天目山直到 2026 年 7 月才首次完整记录到活动影像' },
      { s: '栗头鹟莺', en: 'Chestnut-crowned Warbler', r: 'U', n: '数只', tip: '山区灌层活动，动作极快，2019 年这里记录到 1 只' },
      { s: '白头鹎', en: 'Light-vented Bulbul', r: 'C', n: '极常见', tip: '低山带到处是它的叫声，2019 年单次记录 20 只' },
      { s: '白鹡鸰', en: 'White Wagtail', r: 'C', n: '常见', tip: '溪边、步道地面取食' },
      { s: '北红尾鸲', en: 'Daurian Redstart', r: 'C', n: '常见', tip: '秋冬低山灌丛高频，雄鸟橙腹黑脸' },
    ],
  },
  {
    id: 'wuyanling',
    name: '乌岩岭',
    region: '温州泰顺',
    kind: '山林',
    alt: '海拔 170-1611m',
    note: '黄腹角雉的老家，密林里清晨能听到它低沉的叫声。',
    seasons: ['春', '冬'],
    best: '三到五月',
    scene: 'forest',
    species: [
      { s: '黄腹角雉', en: "Cabot's Tragopan", r: 'R', n: '偶见', tip: '国家一级保护，雄鸟肉角与肉裙求偶时展开。野外种群 520 余只，国内已知密度最高区域之一' },
      { s: '白鹇', en: 'Silver Pheasant', r: 'C', n: '数只', tip: '林下宽阔处活动，晨昏最活跃' },
      { s: '灰胸竹鸡', en: 'Chinese Bamboo Partridge', r: 'C', n: '常见', tip: '叫声「你——嫂子」，两声一顿' },
      { s: '勺鸡', en: 'Koklass Pheasant', r: 'U', n: '数只', tip: '灌丛藏身，叫声像拉锯' },
      { s: '白颈长尾雉', en: "Elliot's Pheasant", r: 'R', n: '偶见', tip: '国家一级，中国特有' },
      { s: '栗头鹟莺', en: 'Chestnut-crowned Warbler', r: 'U', n: '数只', tip: '山区灌层活动，动作极快' },
      { s: '丽星鹩鹛', en: 'Spotted Wren-Babbler', r: 'R', n: '偶见', tip: '藏于密林底层，叫声细而长' },
      { s: '棕噪鹛', en: 'Buffy Laughingthrush', r: 'U', n: '小群', tip: '灌丛里吵闹集群' },
      { s: '红嘴蓝鹊', en: 'Red-billed Blue Magpie', r: 'C', n: '成群', tip: '长尾拖曳，林缘成群' },
      { s: '北红尾鸲', en: 'Daurian Redstart', r: 'U', n: '数只', tip: '秋冬林缘灌丛' },
      { s: '白头鹎', en: 'Light-vented Bulbul', r: 'C', n: '极常见', tip: '低海拔林缘极常见' },
      { s: '白鹡鸰', en: 'White Wagtail', r: 'C', n: '常见', tip: '溪边、步道地面取食' },
    ],
  },
];

/* ────────────────────────── 台风事件 ────────────────────────── */

/**
 * 台风鸟：热带气旋把远洋海鸟带入内陆，观鸟人连夜出发。
 * 这是观鸟圈真实存在的现象，不是虚构玩法。
 */
export const TYPHOON_POOL = [
  {
    s: '白斑军舰鸟',
    en: 'Lesser Frigatebird',
    r: 'M',
    n: '1',
    tip: '雄鸟喉囊鲜红，翼展惊人，被台风吹到内陆全靠运气',
    note: '热带海域鸟类，浙江属偶发迷鸟',
  },
  {
    s: '白额鹱',
    en: 'Streaked Shearwater',
    r: 'R',
    n: '数只',
    tip: '额头白色，贴水滑翔，台风后偶见于内陆湖面',
    note: '繁殖于东亚海岛，台风后可被吹入内陆',
  },
  {
    s: '褐鲣鸟',
    en: 'Brown Booby',
    r: 'M',
    n: '1',
    tip: '胸腹纯白，头背褐色，海上俯冲入水',
    note: '偶发迷鸟',
  },
  {
    s: '红脚鲣鸟',
    en: 'Red-footed Booby',
    r: 'M',
    n: '1',
    tip: '脚鲜红，尾楔形，远洋物种',
    note: '极罕见迷鸟',
  },
  {
    s: '中贼鸥',
    en: 'Pomarine Jaeger',
    r: 'M',
    n: '1',
    tip: '尾羽中央延长，会追击其他海鸟抢夺食物',
    note: '海盗式掠食，台风后偶见',
  },
  {
    s: '白燕鸥',
    en: 'White Tern',
    r: 'M',
    n: '1',
    tip: '通体纯白，黑眼圈，热带物种',
    note: '极罕见',
  },
];

export const TYPHOON_NAMES = [
  '海葵',
  '杜苏芮',
  '灿都',
  '梅花',
  '泰利',
  '小犬',
  '普拉桑',
  '康妮',
];

/* ────────────────────────── 生境标签 ────────────────────────── */

export const HABITATS = {
  ridge: { label: '山脊', icon: '△' },
  hill: { label: '滨海丘陵', icon: '⌒' },
  lake: { label: '湖沼', icon: '〇' },
  wetland: { label: '湿地农田', icon: '≡' },
  reed: { label: '芦苇水网', icon: '〰' },
  tidal: { label: '滨海滩涂', icon: '≈' },
  island: { label: '海岛礁岩', icon: '◇' },
  forest: { label: '山林', icon: '⋀' },
};

/* kind 是中文的，显示名要能直接按 kind 取 */
export const KIND_LABEL = {
  丘陵: '滨海丘陵',
  湖沼: '湖沼',
  湿地农田: '湿地农田',
  湿地: '湿地农田',
  滨海滩涂: '滨海滩涂',
  海岛: '海岛礁岩',
  山林: '山林',
  山脊: '山脊',
};

/* ────────────────────────── 抽签逻辑 ────────────────────────── */

/**
 * 按权重从地点鸟种池抽一只。
 * @param {object} site  SITES 的一项
 * @param {number} luck  0-1 的运气系数，越小越容易出稀有种
 * @param {object} seen  已记录过的鸟种计数（鸟名 -> 次数），用于降低重复率
 */
export function drawSpecies(site, luck = 0.5, seen = null) {
  const pool = site.species;
  // 运气好时抬高稀有种权重，运气差时压低
  const boost = 0.35 + luck * 2.4;
  const weights = pool.map((sp) => {
    const base = RARITY[sp.r]?.weight ?? 10;
    // 稀有度越低，受运气影响越大
    const isRare = sp.r === 'R' || sp.r === 'M' || sp.r === 'X';
    let w = isRare ? base * boost : base;
    // 已经见过的降权：抽第二只同样的鸟的爽感远低于开新图鉴。
    // 只降到四分之一，常见鸟照样会再出现，避免变成纯集邮。
    if (seen && seen[sp.s]) w *= 0.25;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** 抽一个台风鸟 */
export function drawTyphoonBird() {
  return TYPHOON_POOL[Math.floor(Math.random() * TYPHOON_POOL.length)];
}

/** 生成一条观测记录 */
export function makeRecord(site, opts = {}) {
  const { typhoon = false, luck = 0.5, date = null, seen = null } = opts;
  const sp = typhoon ? drawTyphoonBird() : drawSpecies(site, luck, seen);

  const weathers = typhoon
    ? ['暴雨', '大雨', '阴有暴雨']
    : site.kind === '海岛'
    ? ['晴', '多云', '阴', '晴间多云']
    : site.kind === '山脊'
    ? ['晴', '多云', '阴', '雾']
    : site.kind === '丘陵'
    ? ['晴', '多云', '晴间多云', '阴']
    : ['晴', '多云', '阴', '小雨'];

  const winds = typhoon
    ? ['偏东 9 级', '东南 10 级', '偏南 8 级']
    : site.kind === '山脊'
    ? ['东北 3 级', '北 2 级', '东风 4 级']
    : site.kind === '丘陵'
    ? ['东北 3 级', '东风 4 级', '东南 3 级']
    : ['微风', '东南 2 级', '静风', '北 3 级'];

  return {
    siteId: site.id,
    siteName: site.name,
    region: site.region,
    alt: site.alt,
    species: sp.s,
    speciesEn: sp.en,
    rarity: sp.r,
    count: sp.n,
    tip: sp.tip,
    typhoon,
    date: date || randomDate(site),
    weather: pick(weathers),
    wind: pick(winds),
  };
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(site) {
  const now = new Date(2026, 10, 15);
  const monthPool = {
    春: [3, 4, 5],
    夏: [6, 7, 8],
    秋: [9, 10, 11],
    冬: [12, 1, 2],
  };
  const months = site.seasons.flatMap((s) => monthPool[s] || []);
  const m = months[Math.floor(Math.random() * months.length)] || 10;
  const year = m > 11 ? 2025 : 2026;
  const day = 1 + Math.floor(Math.random() * 28);
  return `${year} 年 ${m} 月 ${day} 日`;
}

/* ────────────────────────── 集册统计 ────────────────────────── */

/** 全部可收集鸟种（去重） */
export function allSpecies() {
  const map = new Map();
  for (const site of SITES) {
    for (const sp of site.species) {
      if (!map.has(sp.s)) {
        map.set(sp.s, { ...sp, sites: [site.name] });
      } else {
        map.get(sp.s).sites.push(site.name);
      }
    }
  }
  for (const sp of TYPHOON_POOL) {
    if (!map.has(sp.s)) map.set(sp.s, { ...sp, sites: ['台风后'], typhoonOnly: true });
  }
  return [...map.values()];
}

export const TOTAL_SPECIES = allSpecies().length;
