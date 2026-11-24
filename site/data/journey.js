export const JOURNEY_INTRO = {
  title: '山水之间，怎样落笔',
  kicker: '两山二十年 · 十地治理设问',
  description: '沿着浙江十处生态点位进入二十个治理现场。每次选择都会改变生态、生计与文化的处境，也会把新的问题留给下一轮讨论。',
  scenarioNote: '以下设问均为虚构治理情境，用来理解权衡，不声称还原真实决策。数值只表示选项之间的相对影响方向，没有标准答案。',
};

export const JOURNEY_CHAPTERS = [
  {
    id: 'qianjiangyuan',
    siteId: 'qianjiangyuan',
    title: '钱江源：上游让出的空间',
    subtitle: '清流跨过行政边界，管护成本却留在山里',
    evidence: {
      text: '2016年6月，国家发改委批复钱江源国家公园体制试点方案，试点区面积约252平方公里，涉及4个乡镇、19个行政村、9744人。',
      source: '开化县人民政府，2016-07-15',
    },
    context: '源头保护把林地利用、村集体管理和下游用水放进同一张图。山下得到更稳定的水源，山上则要调整熟悉的生产方式。这里的难题集中在限制如何落地，以及保护成本由谁承担。',
    decisions: [
      {
        id: 'qy-forest-use',
        title: '林子交给谁管',
        situation: '部分集体林地纳入统一管理后，农户担心林下采集和放养收入受影响，管护队也难以靠巡查照看每一处细碎使用。村内仍有生产需求，下游期待更稳定的水源涵养，日常使用权与限制范围需要同时说清。',
        question: '林地管护应当怎样安排限制、补偿与使用权？',
        choices: [
          {
            id: 'qy-forest-use-a',
            label: '统一封护并集中巡查',
            detail: '核心林地暂停经营性采集，由管护队统一巡查，村外使用需求也按同一套准入规则处理。',
            result: '统一巡查能减少核心林地的人为扰动，水源涵养更容易维持。采集和放养停下后，农户收入缺口会直接显现；补偿不到位，巡查再密也难以消除抵触。',
            effects: { ecology: 2, livelihood: -2, culture: 0 },
          },
          {
            id: 'qy-forest-use-b',
            label: '补偿到户并共管林地',
            detail: '按管护责任向农户提供补偿，保留有限采集空间，让村民参与巡护和使用边界的协商。',
            result: '补偿让农户承担管护责任时有了收入托底，参与协商也能把采集边界说得更细。村级管护支出随之增加，若地块权限含糊，共管仍可能放过过度采集。',
            effects: { ecology: 1, livelihood: 1, culture: 1 },
          },
          {
            id: 'qy-forest-use-c',
            label: '分片开放季节性利用',
            detail: '按照地块和时节安排采集、放养，保留农户自主经营权，以抽查代替高频驻点巡查。',
            result: '农户可以按农时和地块安排生产，村里也能省下高频巡查开支。分散采集增加了发现局部破坏的难度，传统经验保留下来的同时，损伤可能积累到明显时才暴露。',
            effects: { ecology: -1, livelihood: 2, culture: 1 },
          },
        ],
      },
      {
        id: 'qy-benefit-share',
        title: '下游收益怎样回到源头',
        situation: '水源地管护需要持续投入，上游村希望支持更稳定，下游用水方则要求资金对应清楚的保护成效。旅游收入在村与村、户与户之间分布不均，难以覆盖所有承担限制的家庭，跨区域支持的对象和标准成了分歧。',
        question: '下游支持上游时，应优先购买什么？',
        choices: [
          {
            id: 'qy-benefit-share-a',
            label: '按管护成效安排补偿',
            detail: '下游资金与水源涵养、巡护记录等结果挂钩，上游村按承担的管护任务获得持续补偿。',
            result: '补偿跟巡护和涵养成效挂钩，下游更容易看清资金去向，上游也有了持续投入的来源。核验工作会增加，难以写进指标的协商和日常照看，可能在结算时被低估。',
            effects: { ecology: 2, livelihood: 1, culture: -1 },
          },
          {
            id: 'qy-benefit-share-b',
            label: '共同投资上游生计',
            detail: '下游参与支持上游就业和生态产品经营，把部分保护投入转化为本地长期收入来源。',
            result: '保护投入转成就业和经营项目后，上游有机会形成自己的收入来源，减少对补偿的依赖。筹备期会分流部分管护资金，市场变化也会把波动带给参与农户。',
            effects: { ecology: 0, livelihood: 2, culture: 1 },
          },
          {
            id: 'qy-benefit-share-c',
            label: '上游自行扩大接待',
            detail: '减少跨区域协商，通过增加访客服务与经营设施，让靠近入口的村庄先筹集管护资金。',
            result: '入口附近的村庄能靠接待先获得现金流，不必等待跨区域协商。客源和收益会继续向交通方便的地方集中，新增设施与访客也让管护压力跟着进入山里。',
            effects: { ecology: -1, livelihood: 2, culture: -1 },
          },
        ],
      },
    ],
    reflection: '上游承担的限制落在具体家庭和地块，下游获得的水源涵养却难以逐户计价。把补偿、经营和管护混在一起，容易掩盖谁实际付出了成本。',
  },
  {
    id: 'xiajiang',
    siteId: 'xiajiang',
    title: '下姜村：客人来了以后',
    subtitle: '溪水变清只是开端，收益与拥挤需要重新分配',
    evidence: {
      text: '2024年，下姜村村民人均可支配收入54931元，年接待游客56.87万人次，旅游收入9072万元。',
      source: '淳安县政府答复函，2026-06',
    },
    context: '环境改善和民宿经营让山村与外部市场连接得更紧。客流进入后，公共空间、村民生活和周边村庄的收益都受到影响。这里需要同时处理接待承载与区域分配，不能把热闹直接等同于普遍受益。',
    decisions: [
      {
        id: 'xj-visitor-capacity',
        title: '旺季的村口怎么疏',
        situation: '周末客流集中进村，停车、垃圾清运和沿溪住户的休息都开始吃紧。经营户担心限流损失旺季收入，周边村希望接入线路分担接待，进村方式和游览范围因而牵动多方收益。',
        question: '客流接近承载边界时，应先限制还是疏导？',
        choices: [
          {
            id: 'xj-visitor-capacity-a',
            label: '预约限流并集中接驳',
            detail: '核心村按时段预约，车辆停在外围，垃圾清运与公共空间维护从接待收入中得到保障。',
            result: '分时预约和外围接驳能压低核心村的拥挤，垃圾与公共空间维护也有了收入来源。临时到店的消费会减少，依赖散客的小经营户比成熟民宿更难补上这块缺口。',
            effects: { ecology: 2, livelihood: -1, culture: 1 },
          },
          {
            id: 'xj-visitor-capacity-b',
            label: '开放接待并增设车位',
            detail: '尽量满足旺季需求，在村口增加停车和服务空间，用经营收益覆盖新增管理与清洁支出。',
            result: '车位和服务空间增加后，旺季订单与用工更容易留下，经营收益也能覆盖部分清洁支出。道路和滨水空间被进一步占用，建设、管理及后续维护会一起加码。',
            effects: { ecology: -2, livelihood: 2, culture: -1 },
          },
          {
            id: 'xj-visitor-capacity-c',
            label: '联村线路分散客流',
            detail: '把部分活动引向周边村，统一安排接驳与讲解，核心村保留基础接待，不单独扩大容量。',
            result: '联村线路能把拥挤从核心村疏开，周边经营者获得接触客源的机会。接驳和分账需要各村持续协调，客流进入接待能力较弱的地方后，环境压力也会随之外移。',
            effects: { ecology: -1, livelihood: 2, culture: 1 },
          },
        ],
      },
      {
        id: 'xj-regional-income',
        title: '联村收益按什么分',
        situation: '周边村共同接入线路后，有的提供房间，有的负责接驳和环境维护，也有的主要供应农产品。游客仍更熟悉下姜村的名字，各村对品牌使用、公共投入和收入分配出现分歧。',
        question: '共同品牌带来的收入，怎样分才算可接受？',
        choices: [
          {
            id: 'xj-regional-income-a',
            label: '按实际订单各自结算',
            detail: '住宿、餐饮与农产品分别归经营者，公共品牌只负责推广，各村自行承担服务与环境成本。',
            result: '订单直接归经营者，账目简单，住宿和餐饮等接单能力强的村能较快兑现收益。接驳、清洁等公共服务没有订单可结算，承担这些工作的村庄容易持续贴钱。',
            effects: { ecology: -1, livelihood: 1, culture: -1 },
          },
          {
            id: 'xj-regional-income-b',
            label: '提取公共金再按劳分配',
            detail: '共同收入先支持接驳、清洁和公共景观，再按服务量分配，让维护者也进入结算。',
            result: '公共金先把接驳、清洁和景观维护纳入成本，幕后劳动有了结算入口。各村当期拿到的现金会减少，服务量怎样折算、公共投入够不够，都会成为分配争议。',
            effects: { ecology: 1, livelihood: 1, culture: 1 },
          },
          {
            id: 'xj-regional-income-c',
            label: '统一经营再平均分红',
            detail: '由共同平台承接主要订单，扣除运营成本后在成员村之间分配，弱化单村独立定价。',
            result: '统一平台能给订单较少的村一份稳定分红，也能集中安排公共服务。独立经营的空间随之收窄，勤快接单与少接单若回报接近，农户的积极性可能受影响。',
            effects: { ecology: 1, livelihood: 0, culture: 1 },
          },
        ],
      },
    ],
    reflection: '联村经营把房间、接驳、农产品和清洁放进同一条线路。只统计订单，会漏掉没有直接收费的劳动；只追求平均分，又可能抹平经营投入的差异。',
  },
  {
    id: 'yucun',
    siteId: 'yucun',
    title: '余村：关停之后的空档',
    subtitle: '旧账本停下来，新账本未必马上接上',
    evidence: {
      text: '余村2003年分两步表决关停矿山和水泥厂，2005年3月底全部关停；2004年村集体收入最少时减少到21万元。',
      source: '人民日报，2025-08-14；求是《余村调查》，2025-11',
    },
    context: '矿山与水泥厂退出后，环境负荷下降，原有收入和岗位也需要重新安排。遗址、山体与村庄记忆仍然相连。这里要面对的既有转型期的生计空档，也有工业痕迹该保留还是抹去的选择。',
    decisions: [
      {
        id: 'yc-income-gap',
        title: '收入空档谁来托住',
        situation: '关停后的山体修复已经展开，新产业尚未形成稳定现金流。部分劳动力想尽快就业，村集体还要承担公共开支，外来项目则希望尽快取得经营空间，过渡期先保岗位还是先引项目难以兼顾。',
        question: '转型尚未接续时，有限的资源应先投向哪里？',
        choices: [
          {
            id: 'yc-income-gap-a',
            label: '先设修复与管护岗位',
            detail: '把可用资金优先用于山体修复、巡查和公共服务岗位，让原有劳动者参与环境恢复。',
            result: '修复、巡查和公共服务岗位能接住部分原有劳动者，山体治理也能同步推进。资金主要来自公共投入，经营现金流增长有限，岗位能否持续取决于后续经费。',
            effects: { ecology: 2, livelihood: 1, culture: 0 },
          },
          {
            id: 'yc-income-gap-b',
            label: '尽快引进加工项目',
            detail: '优先引入用工较多、排放可控的加工项目，以较快的工资和税收回报填补收入空档。',
            result: '加工项目带来的工资和税收能缩短收入空档，村庄也会更快形成新的产业支点。用地、运输和排放随之增加，修复支出并不会因为就业回升而消失。',
            effects: { ecology: -1, livelihood: 2, culture: -1 },
          },
          {
            id: 'yc-income-gap-c',
            label: '逐步改造乡村旅游',
            detail: '先改造存量房屋与公共空间，小规模培育接待能力，把收入增长放在山体修复之后。',
            result: '先改存量房屋和公共空间，能少铺新摊子，也能为接待保留村庄尺度。岗位与客流出现得较慢，过渡期收入承压，经营能力差异还会影响后续收益。',
            effects: { ecology: 1, livelihood: 0, culture: 1 },
          },
        ],
      },
      {
        id: 'yc-mine-afterlife',
        title: '矿坑留到什么地步',
        situation: '关闭的矿区需要先处理安全隐患，村民对裸露岩壁的去留也有分歧。有人希望尽快复绿，有人想保留生产记忆，经营者提出把遗址直接改成游览项目，修复范围与展示强度需要一起划定。',
        question: '矿山遗址应优先恢复自然，还是保留生产痕迹？',
        choices: [
          {
            id: 'yc-mine-afterlife-a',
            label: '以复绿覆盖生产痕迹',
            detail: '完成安全处置后尽量恢复植被和地形，只保留必要说明，把游赏活动安排在外围。',
            result: '植被和地形恢复后，山体受扰动的机会减少，游赏也被留在外围。较高的修复投入换不来多少展示空间，采矿历史失去实物依托，后人能看到的痕迹会变少。',
            effects: { ecology: 2, livelihood: -1, culture: -2 },
          },
          {
            id: 'yc-mine-afterlife-b',
            label: '保留遗址并限定参观',
            detail: '在安全范围内保留部分岩壁与生产设施，设置受控参观线路，其余区域继续生态修复。',
            result: '部分岩壁和设施留下，村庄的生产记忆有了具体载体。修复与安全管理要同时花钱，受控线路能限制进入范围，却也让保留区长期承担侵蚀和巡查成本。',
            effects: { ecology: 1, livelihood: 0, culture: 2 },
          },
          {
            id: 'yc-mine-afterlife-c',
            label: '整体改造沉浸式景区',
            detail: '利用矿区空间布置游览设施和体验项目，以经营收入反哺修复，并扩大可进入范围。',
            result: '景区改造能在建设和运营中带来岗位，经营收入也可能补上修复经费。可进入范围扩大后，施工、设施和高频使用会挤压自然恢复，遗址原貌更易被项目内容覆盖。',
            effects: { ecology: -2, livelihood: 2, culture: 0 },
          },
        ],
      },
    ],
    reflection: '关停让旧收入停下，修复、就业和集体开支却同时到来。矿坑怎么处理也不只关系景观，它还决定村民以后拿什么讲述这段生产经历。',
  },
  {
    id: 'xinxinqiao',
    siteId: 'xinxinqiao',
    title: '新溪桥村：一块菜地的续约',
    subtitle: '认养关系要穿过天气、收成和期待落差',
    evidence: {
      text: '新溪桥村共享菜园面积9亩，2024年6月引进运营团队，已有100余位城市居民付费参与农事体验。',
      source: '本组实地调研；新溪桥村调研反馈表',
    },
    context: '共享菜园把土地、农事服务和城市消费者连在一起，收益取决于持续信任。菜长得怎样只是其中一环，风险由谁承担、规模扩张到哪里，都会影响农户劳动和认养者体验。',
    decisions: [
      {
        id: 'xxq-crop-risk',
        title: '歉收时先解释什么',
        situation: '连续不利天气影响部分地块收成，认养者仍期待稳定配送，农户担心补种增加成本，运营团队则怕续约率下滑。合同对自然风险写得粗略，各方对一份安心收成的理解并不一致。',
        question: '自然风险出现时，成本与预期该怎样分担？',
        choices: [
          {
            id: 'xxq-crop-risk-a',
            label: '运营方补足约定配送',
            detail: '由运营团队从其他地块调配蔬菜，尽量维持原有配送，农户按既有标准获得服务报酬。',
            result: '从其他地块调菜可以稳住配送和认养体验，农户的服务报酬也不必随减产波动。采购与调配集中压在运营方身上，连续歉收时，价格和服务投入会受到挤压。',
            effects: { ecology: 0, livelihood: 1, culture: -1 },
          },
          {
            id: 'xxq-crop-risk-b',
            label: '公开减产并共同承担',
            detail: '向认养者说明地块情况，减少当期配送，邀请其参与补种，并提供后续农事体验作为回应。',
            result: '把减产和补种过程摊开，认养者能看到天气怎样进入一块菜地，运营方也少了保底采购压力。当期配送减少会损伤满意度，只想要稳定商品的人可能不再续约。',
            effects: { ecology: 1, livelihood: -1, culture: 2 },
          },
          {
            id: 'xxq-crop-risk-c',
            label: '农户补种并保障产量',
            detail: '要求农户通过补种和加强管理尽量完成约定产出，运营团队维持原有销售承诺。',
            result: '原有销售承诺得以维持，农户却要用更多补种、管理和投入追赶产量。天气风险集中落到生产者一端，管理强度上升后，小农户更难承受下一轮波动。',
            effects: { ecology: -1, livelihood: -1, culture: -1 },
          },
        ],
      },
      {
        id: 'xxq-growth-limit',
        title: '订单多了往哪里扩',
        situation: '认养需求继续增加，现有地块的接待与耕作已接近忙碌状态。扩面积、提价格或拆分配送与体验都能消化部分需求，却会分别改变土地使用、参与门槛和农户与认养者的联系。',
        question: '需求超过现有承载时，菜园应扩大还是做深？',
        choices: [
          {
            id: 'xxq-growth-limit-a',
            label: '扩展地块承接订单',
            detail: '把更多土地纳入认养，统一服务标准，通过增加配送和农事活动消化增长需求。',
            result: '更多地块和订单能带来用工与收入，统一标准也便于复制服务。配送和农事活动一起增加后，接待管理更复杂，连片经营还会改变原有地块的使用与参与方式。',
            effects: { ecology: -1, livelihood: 2, culture: -1 },
          },
          {
            id: 'xxq-growth-limit-b',
            label: '控制面积提高服务价',
            detail: '保持现有耕作范围，把增收放在更细的农事记录、指导和体验上，用价格筛选需求。',
            result: '不扩地可以守住现有耕作强度，把增收放在记录、指导和体验上。价格提高会筛走部分认养者，单块地收益即使上升，能参与的人群也会变窄。',
            effects: { ecology: 1, livelihood: 1, culture: -1 },
          },
          {
            id: 'xxq-growth-limit-c',
            label: '拆分配送与体验服务',
            detail: '让认养者分别选择蔬菜配送或到村体验，减少每个人都到场的要求，再安排农户分工。',
            result: '配送与体验分开后，不到村的认养者也能留下，现场拥挤和农户接待负担有所缓解。配送订单若占去多数，认养会更容易退成买菜，人与具体地块的联系随之变淡。',
            effects: { ecology: 0, livelihood: 2, culture: -2 },
          },
        ],
      },
    ],
    reflection: '共享菜园卖的不只是蔬菜，还包括天气、劳动和到村体验怎样被解释。扩地、提价或拆分服务，都会重新分配这些内容在交易中的分量。',
  },
  {
    id: 'pujiang',
    siteId: 'pujiang',
    title: '浦江：清水背后的转产',
    subtitle: '河流恢复之后，产业与维护仍要付出成本',
    evidence: {
      text: '浦江整治中关停2.2万余家水晶加工户，保留约1300家企业集中入园；治理后出境断面水质提升至Ⅲ类。',
      source: '生态环境部美丽河湖案例；浦江县2024环境质量公报',
    },
    context: '强力整治切断了大量低小散加工带来的污染，也改变了家庭作坊的生计路径。水质改善后，治理重心从集中关停转向长期维护。这里要同时看企业转型的承受力和河流公共收益的使用方式。',
    decisions: [
      {
        id: 'pj-workshop-transition',
        title: '作坊怎样跨过门槛',
        situation: '集中园区的环保设施更完整，但租金、设备和规范管理提高了进入成本。部分家庭作坊希望保留原有生产，部分人已经考虑转行，园区企业则担心宽松准入会削弱共同治理。你要安排转型规则。',
        question: '环保门槛提高后，原有作坊应怎样进入新生产体系？',
        choices: [
          {
            id: 'pj-workshop-transition-a',
            label: '统一入园并限期改造',
            detail: '要求继续生产的作坊进入园区，按统一标准改造设备与排放，未达标者退出加工环节。',
            result: '污染会更容易集中管理，小作坊则承受资金与搬迁压力。规范生产有利于稳定水质，但行业集中可能减少家庭经营机会。',
            effects: { ecology: 2, livelihood: -2, culture: -1 },
          },
          {
            id: 'pj-workshop-transition-b',
            label: '共享设备分步升级',
            detail: '由园区提供共享处理和加工设备，让作坊分批接入，在过渡期内完成环保与技能改造。',
            result: '协调和设备投入较高，作坊可保留更多经营连续性。共享能降低部分门槛，但分散生产仍需要严格监管才能控制排放。',
            effects: { ecology: 1, livelihood: 1, culture: 0 },
          },
          {
            id: 'pj-workshop-transition-c',
            label: '支持退出并转向服务',
            detail: '对不愿承担入园成本的家庭提供转产服务，把资源更多用于商贸、配套和河道维护岗位。',
            result: '部分加工技能会退出，转岗者需要适应收入波动。产业污染压力可继续下降，但原有生产网络与手艺传承可能加快消散。',
            effects: { ecology: 2, livelihood: 0, culture: -2 },
          },
        ],
      },
      {
        id: 'pj-river-maintenance',
        title: '清水带来的钱怎么花',
        situation: '河道恢复后，沿线空间更有吸引力，商业运营、景观建设和日常维护都提出资金需求。居民希望水岸可用，经营者希望延长停留时间，管护人员则提醒污染风险会随活动增加。你要确定支出优先级。',
        question: '水岸收益应优先回到商业、景观还是生态维护？',
        choices: [
          {
            id: 'pj-river-maintenance-a',
            label: '先保监测与日常保洁',
            detail: '收益优先用于水质监测、保洁和设施检修，商业项目只能使用已划定的外围空间。',
            result: '可经营的岸线较少，水质维护更有保障。稳定管护能延缓问题反弹，但单一公共投入可能缺少持续的经营补充。',
            effects: { ecology: 2, livelihood: -1, culture: 0 },
          },
          {
            id: 'pj-river-maintenance-b',
            label: '引入滨水经营反哺',
            detail: '开放部分水岸用于餐饮和休闲，把经营收益按约定投入河道维护，并扩大公共服务。',
            result: '就业和公共空间活力会增加，垃圾与污水管理压力同步上升。经营能补充管护资金，但商业扩张可能逐步逼近生态边界。',
            effects: { ecology: -1, livelihood: 2, culture: 1 },
          },
          {
            id: 'pj-river-maintenance-c',
            label: '建设岸线和自然课堂',
            detail: '把资金用于亲水步道、生态修复与公共讲解，减少固定商业设施，以低强度使用为主。',
            result: '商业回报有限，居民能获得更多开放空间。生态与公共使用可以结合，但维护费用和解说质量仍需稳定机制支撑。',
            effects: { ecology: 1, livelihood: 0, culture: 2 },
          },
        ],
      },
    ],
    reflection: '治水并不会在断面达标时结束。产业门槛、家庭转产和水岸收益仍需持续安排，清水才可能从整治成果变成日常状态。',
  },
  {
    id: 'yunhe',
    siteId: 'yunhe',
    title: '云和梯田：让田继续被种',
    subtitle: '修复的不只是景观，还有渠、坎与耕作关系',
    evidence: {
      text: '浙江云和梯田农业系统2015年10月入选中国重要农业文化遗产；2021年起，县里投入2700万元修复退化梯田湿地4500亩。',
      source: '农村信息报，2022-07-16；人民网，2025-10-19',
    },
    context: '梯田依靠持续耕作维持田坎、水系和种养循环，劳动力外流会让整套景观失去日常维护。遗产认定和景区发展带来新机会，也可能把田变成只供观看的背景。这里要在修复方式与使用强度之间取舍。',
    decisions: [
      {
        id: 'yh-terrace-restoration',
        title: '荒田由谁来复耕',
        situation: '部分梯田已经荒芜，田坎蓄水能力下降，原耕作者年龄偏大。施工队能快速整理地形，熟悉水路的农户更了解细小高差，外来经营者则希望集中承包。你要确定修复与后续耕作的衔接方式。',
        question: '梯田修复应优先考虑工程速度，还是耕作连续性？',
        choices: [
          {
            id: 'yh-terrace-restoration-a',
            label: '机械整修后集中流转',
            detail: '用工程方式快速修复田坎和道路，再交由经营主体统一耕作，原农户获得流转收益。',
            result: '景观和蓄水条件可较快恢复，施工对局部地块的扰动较大。集中经营便于维持耕作，但农户与田间管理的直接联系会减少。',
            effects: { ecology: 0, livelihood: 1, culture: -2 },
          },
          {
            id: 'yh-terrace-restoration-b',
            label: '农户主导按传统修复',
            detail: '由熟悉田坎和水系的农户参与修复，保留分散经营，公共资金补料并购买部分劳务。',
            result: '进度较慢，参与农户能获得劳务收入并延续原有方法。田坎与水系更容易被日常照看，但劳动力不足仍会限制恢复范围。',
            effects: { ecology: 1, livelihood: 1, culture: 2 },
          },
          {
            id: 'yh-terrace-restoration-c',
            label: '先修有经营者承租的田',
            detail: '把有限资金集中在已有承租或复耕主体的地块，其余荒田暂缓，减少修后再次闲置。',
            result: '资金使用更聚焦，偏远和零散地块可能继续退化。修后用上的概率较高，但梯田系统的完整性会受到选择差异影响。',
            effects: { ecology: 0, livelihood: 2, culture: -1 },
          },
        ],
      },
      {
        id: 'yh-farming-visitors',
        title: '观景和耕作谁让路',
        situation: '游客希望走进田间拍摄和体验，农户则要按农时灌水、插秧和收获。部分最佳观景点与生产通道重合，活动安排稍多就会打断劳作。你要制定游览组织与农业收益的分配办法。',
        question: '旅游进入生产性梯田时，哪条边界不能退让？',
        choices: [
          {
            id: 'yh-farming-visitors-a',
            label: '核心农田谢绝游客',
            detail: '生产区不安排游览，把观景和解说集中在外围平台，农户专注耕作并获得景观维护补偿。',
            result: '田间干扰会减少，可销售的体验项目也随之减少。农时和生态循环更易保持，但补偿不足时农户仍可能缺少留田动力。',
            effects: { ecology: 2, livelihood: -1, culture: 1 },
          },
          {
            id: 'yh-farming-visitors-b',
            label: '预约参与真实农事',
            detail: '按农时开放小规模体验，由农户带领并收取服务费，生产安排优先于游客拍摄需求。',
            result: '组织成本较高，农户可从劳动展示中获得额外收入。农事知识有机会继续传递，但体验商业化也可能改变原有生产节奏。',
            effects: { ecology: 0, livelihood: 2, culture: 1 },
          },
          {
            id: 'yh-farming-visitors-c',
            label: '拓宽游线承接客流',
            detail: '修建更完整的田间游线，延长开放时段，通过门票与经营收益支持梯田维护。',
            result: '接待能力和维护资金会增加，建设及通行会影响部分田块。旅游能形成稳定市场，但生产空间可能逐步服从观景需求。',
            effects: { ecology: -2, livelihood: 2, culture: -1 },
          },
        ],
      },
    ],
    reflection: '梯田失去耕作者，田坎和水渠也会失去维护者。景观收入能否回到农时、劳动与地块，决定这片田继续生产还是只留下外形。',
  },
  {
    id: 'xixi',
    siteId: 'xixi',
    title: '西溪湿地：城市边的留白',
    subtitle: '共享绿意与安静生境，需要不同的空间尺度',
    evidence: {
      text: '西溪湿地现有面积10.38平方公里，水域占68.02%；截至2024年底，记录维管束植物971种、昆虫918种、鸟类224种。',
      source: '杭州市林业水利局，2025',
    },
    context: '城中湿地同时承担生境保护、公共游憩和经营维护。水网与鱼塘保持成片相接，游览需求却会把人带向更安静的空间。这里要处理公众接近自然的权利，也要判断监测成果应怎样服务管理。',
    decisions: [
      {
        id: 'xx-visitor-access',
        title: '观鸟热往哪里引导',
        situation: '鸟类记录增加后，摄影者希望进入更隐蔽的水域，普通游客也期待更多开放空间。管护人员发现部分活动接近繁殖区域，经营者则担心收紧线路会降低吸引力。你要重画访问边界。',
        question: '公众接近湿地的机会，应怎样与安静生境并存？',
        choices: [
          {
            id: 'xx-visitor-access-a',
            label: '核心封闭并预约外围',
            detail: '繁殖与关键栖息区域不开放，外围实行分时段预约，把观测活动集中在既有设施附近。',
            result: '部分深度体验会受限，核心生境获得的干扰较少。边界有利于稳定保护，但公众理解若缺少解释，封闭可能被当成单纯排斥。',
            effects: { ecology: 2, livelihood: -1, culture: 0 },
          },
          {
            id: 'xx-visitor-access-b',
            label: '隐蔽观察点替代进入',
            detail: '在外围建设有遮挡的观察点并配讲解，用固定线路承接观鸟需求，不开放敏感水域。',
            result: '需要新增建设和管理投入，游览秩序有望改善。固定设施能集中扰动并支持自然教育，但热门点位仍可能形成新的拥挤。',
            effects: { ecology: 1, livelihood: 0, culture: 2 },
          },
          {
            id: 'xx-visitor-access-c',
            label: '放宽水路提高接待',
            detail: '增加船游和夜间活动，让更多人接近湿地内部，以新增经营收入支持巡护。',
            result: '接待与经营收入会增长，管护资金更容易筹集。水陆活动扩张可能切割安静生境，照明和噪声也会增加管理难度。',
            effects: { ecology: -2, livelihood: 2, culture: 0 },
          },
        ],
      },
      {
        id: 'xx-monitoring-use',
        title: '物种记录服务谁',
        situation: '持续监测积累了物种变化资料，科研团队希望保持统一口径，公众想看到更易懂的实时信息，运营方则提出用明星物种开发产品。数据公开越细，敏感位置暴露和误读的风险也越高。',
        question: '生物多样性数据应优先用于研究、公开还是经营？',
        choices: [
          {
            id: 'xx-monitoring-use-a',
            label: '内部监测主导管理',
            detail: '保持完整数据主要供管护与研究使用，只公开汇总趋势，不披露敏感物种的具体位置。',
            result: '公众可见信息较少，研究和保护口径更稳定。数据能直接服务生境管理，但社会参与和公共理解可能缺少具体入口。',
            effects: { ecology: 2, livelihood: -1, culture: -1 },
          },
          {
            id: 'xx-monitoring-use-b',
            label: '分级公开并吸引共测',
            detail: '公开经过处理的物种信息与解释，邀请公众参与规范观察，敏感位置仍由管护方保留。',
            result: '审核、培训和纠错工作会增加，公众能获得更具体的参与方式。社会观察可补充资料，但记录质量差异需要持续校准。',
            effects: { ecology: 1, livelihood: 0, culture: 2 },
          },
          {
            id: 'xx-monitoring-use-c',
            label: '围绕明星物种开发',
            detail: '把高关注度物种用于主题游线和文创经营，让部分收益回到监测与栖息地维护。',
            result: '传播和经营机会会增加，监测可能获得新资金。公众关注能转化为支持，但热点物种与地点也容易承受过度聚集。',
            effects: { ecology: -1, livelihood: 2, culture: 1 },
          },
        ],
      },
    ],
    reflection: '城市湿地既向公众开放，也需要保留不被打扰的部分。开放多少、公开到什么颗粒，都要看生境能否承受随之而来的注意。',
  },
  {
    id: 'dachendao',
    siteId: 'dachendao',
    title: '大陈岛：海里的新账本',
    subtitle: '碳汇有了价格，修复与分配仍需回答去向',
    evidence: {
      text: '2023年10月底，大陈岛2223吨贝类碳汇以10.05万元成交，为浙江省首笔海洋蓝碳（贝类）交易；碳汇收入的40%以上用于反哺岛上生态保护。',
      source: '人民日报《人工养贻贝 还能卖碳汇》，2025-08-05',
    },
    context: '蓝碳交易把贝类养殖、生态价值和资金管理连接起来，也让核算与分配成为新问题。海岛产业仍依赖海域条件，扩大养殖能带来收入，也会改变局部环境压力。这里要在价格之外安排收益和规模。',
    decisions: [
      {
        id: 'dc-carbon-revenue',
        title: '碳汇收入先补哪里',
        situation: '一笔蓝碳收入进入分配环节，养殖户希望直接获得回报，管护方希望用于岸线与生境修复，购买方则关心碳汇核算能否持续验证。每项用途都合理，现有资金无法同时充分满足。',
        question: '蓝碳收益应先奖励生产、投入修复，还是保障核算？',
        choices: [
          {
            id: 'dc-carbon-revenue-a',
            label: '多数收益分给养殖户',
            detail: '优先让提供碳汇的养殖主体获得现金回报，其余部分维持基础核算和必要巡护。',
            result: '养殖积极性会提高，可用于公共修复的资金相对有限。直接回报有助于维持参与，但海域公共问题可能缺少稳定投入。',
            effects: { ecology: -1, livelihood: 2, culture: 0 },
          },
          {
            id: 'dc-carbon-revenue-b',
            label: '收益集中用于修复',
            detail: '把主要收入投向岸线、植被和海洋生境维护，养殖主体通过后续项目获得间接收益。',
            result: '公共修复更容易推进，养殖户的直接所得较少。生境改善可能支撑产业基础，但分配透明度不足会削弱参与意愿。',
            effects: { ecology: 2, livelihood: -1, culture: 0 },
          },
          {
            id: 'dc-carbon-revenue-c',
            label: '先建核算与分配规则',
            detail: '优先投入监测、核算和公开分配机制，再按约定比例支持养殖户与生态修复项目。',
            result: '可分配现金会减少，交易依据和账目会更清楚。稳定规则有利于持续交易，但专业维护成本会长期存在。',
            effects: { ecology: 1, livelihood: 0, culture: 1 },
          },
        ],
      },
      {
        id: 'dc-aquaculture-scale',
        title: '养殖规模听哪本账',
        situation: '蓝碳与大黄鱼产业让养殖受到更多关注，经营主体希望扩大海域使用，岛上居民关心就业，管护人员则提醒局部密度和废弃物需要控制。扩大规模还能提高供给，却可能增加环境波动。',
        question: '市场看好时，养殖扩张应由什么条件约束？',
        choices: [
          {
            id: 'dc-aquaculture-scale-a',
            label: '先扩规模再补监测',
            detail: '优先满足养殖主体的扩产需求，在新增收入形成后补充监测和废弃物处理能力。',
            result: '产量、岗位和经营收入有望增加，环境风险也会先积累。规模可巩固产业地位，但监测滞后可能让问题到明显时才处理。',
            effects: { ecology: -2, livelihood: 2, culture: 0 },
          },
          {
            id: 'dc-aquaculture-scale-b',
            label: '按海域容量分配额度',
            detail: '先评估海域承载和现有密度，再分配养殖空间，新增主体须同步承担监测与清理责任。',
            result: '扩张速度会放缓，部分经营者错失市场机会。环境边界更清楚，产业稳定性可能提高，但额度分配需要持续公信力。',
            effects: { ecology: 2, livelihood: 0, culture: 0 },
          },
          {
            id: 'dc-aquaculture-scale-c',
            label: '轮养休养并共享设施',
            detail: '不同片区安排轮养和休养，共同使用监测与废弃物处理设施，以效率改善替代单纯扩张。',
            result: '协调成本增加，部分海区不能持续满负荷生产。海域有恢复窗口，设施共享也能帮助小主体，不过执行依赖各方配合。',
            effects: { ecology: 1, livelihood: 1, culture: 1 },
          },
        ],
      },
    ],
    reflection: '海里的碳有了价格，不等于生态价值已经算完。收益分给谁、规模由什么约束，会反过来决定这本账能记多久。',
  },
  {
    id: 'sangji',
    siteId: 'sangji',
    title: '桑基鱼塘：循环怎样接续',
    subtitle: '每一环都能利用，也意味着每一环都要有人做',
    evidence: {
      text: '湖州桑基鱼塘系统2017年11月23日列入全球重要农业文化遗产；核心保护区总面积1390亩，其中荻港村1007亩、射中村383亩。',
      source: '中青在线，2017-11-24；湖州市农业农村局，2025',
    },
    context: '桑、蚕、鱼与塘泥构成相互依赖的生产循环，其中任何一环收益不足，都可能改变整套系统。遗产保护与旅游关注提供了新资源，也让展示和真实生产之间出现张力。这里要保住循环的运转条件。',
    decisions: [
      {
        id: 'sj-cycle-viability',
        title: '低收益环节留不留',
        situation: '养鱼收益较直接，种桑养蚕却需要更多劳动，部分农户想减少桑树和蚕事，把精力转向鱼塘。经营者建议只做游客能看到的环节，老农户担心循环断开后塘泥与肥料关系也会改变。',
        question: '循环中收益较弱的环节，应靠补贴、市场还是替代维持？',
        choices: [
          {
            id: 'sj-cycle-viability-a',
            label: '补贴完整种养循环',
            detail: '对种桑、养蚕和清塘壅桑分别提供支持，要求核心地块维持完整环节与记录。',
            result: '农户劳动得到补偿，公共支出和核验工作会增加。完整循环更可能保留，但生产积极性可能依赖持续补贴。',
            effects: { ecology: 2, livelihood: 0, culture: 2 },
          },
          {
            id: 'sj-cycle-viability-b',
            label: '允许替换低收益环节',
            detail: '保留塘基与鱼塘的基本关系，让农户用其他种植或投入品替代部分传统环节。',
            result: '经营灵活性提高，农户可集中做收益较好的部分。地块仍能生产，但传统物质循环和配套知识可能逐步简化。',
            effects: { ecology: 0, livelihood: 2, culture: -2 },
          },
          {
            id: 'sj-cycle-viability-c',
            label: '开发蚕桑产品补收益',
            detail: '把蚕桑环节接到加工、体验和订单销售上，用市场回报支撑完整循环，减少直接补贴。',
            result: '产品开发和销售成本较高，农户要适应新的质量标准。多元收入可支撑传统环节，但订单偏好也可能塑造种养方式。',
            effects: { ecology: 1, livelihood: 1, culture: 1 },
          },
        ],
      },
      {
        id: 'sj-heritage-tourism',
        title: '遗产展示放到哪里',
        situation: '游客希望看到完整的塘基种养过程，核心地块却仍在生产。集中展示便于管理，也会把真实劳动改成定时表演；分散进村更有生活感，却可能影响农户作息。你要确定展示空间与收益归属。',
        question: '农业文化遗产应展示生产过程，还是另建一套观看系统？',
        choices: [
          {
            id: 'sj-heritage-tourism-a',
            label: '另设示范区承接观看',
            detail: '在核心生产区外布置完整展示地块和讲解，游客不到正常生产塘边，示范人员获得专门报酬。',
            result: '生产和游览都更容易管理，建设与维护需要新增投入。核心地块受扰较少，但展示可能与真实农事逐渐拉开距离。',
            effects: { ecology: 1, livelihood: 0, culture: -1 },
          },
          {
            id: 'sj-heritage-tourism-b',
            label: '跟随农户进入真实生产',
            detail: '按农时组织小规模访学，由实际种养者讲解并获得收益，活动随生产变化而调整。',
            result: '接待时间和内容不稳定，农户能增加服务收入。知识与劳动可被直接理解，但游客期待可能与农时反复冲突。',
            effects: { ecology: 0, livelihood: 1, culture: 2 },
          },
          {
            id: 'sj-heritage-tourism-c',
            label: '扩大节庆与固定演出',
            detail: '把塘桑循环转化为固定展演和节庆产品，通过集中客流带动餐饮、住宿与农产品销售。',
            result: '村庄热度和综合消费会增加，核心生产区压力相对可控。经营链条能延长，但固定脚本可能把复杂循环压缩成少数符号。',
            effects: { ecology: -1, livelihood: 2, culture: -1 },
          },
        ],
      },
    ],
    reflection: '循环农业的难点不在看懂一张图，而在让每个低收益环节仍有人承担。展示可以带来收入，也可能替代真实生产。',
  },
  {
    id: 'tengtou',
    siteId: 'tengtou',
    title: '滕头村：规矩怎样更新',
    subtitle: '一票否决守住边界，也要经受新的利益协商',
    evidence: {
      text: '滕头村1993年设立全国最早的村级环保委员会，对污染项目一票否决，累计否决数十个效益好但影响环境的项目，涉资4亿元以上。',
      source: '奉化区政府，2023-06-30；奉化日报，2023-08-15',
    },
    context: '村级环境规则把项目选择权留在村庄内部，否决高污染项目也意味着放弃部分眼前收益。当项目类型和村民需求变化后，原有边界仍需执行，规则的参与方式也要更新。这里要处理准入与治理延续。',
    decisions: [
      {
        id: 'tt-project-entry',
        title: '有收益的项目怎么审',
        situation: '一个新项目承诺带来就业和集体收入，同时存在排放与运输压力。支持者认为技术升级可以控制风险，反对者担心开口子后原有否决规则失去约束力，部分村民则更关心岗位能否留在本地。',
        question: '面对有收益也有环境压力的项目，村级规则应怎样回应？',
        choices: [
          {
            id: 'tt-project-entry-a',
            label: '触发否决就不再洽谈',
            detail: '只要项目触及既有污染边界就直接退出，把招商精力转向符合规则的替代项目。',
            result: '村庄会失去一批就业和收入机会，环境边界保持清楚。规则可预期性较强，但替代项目不足时集体经济可能承受压力。',
            effects: { ecology: 2, livelihood: -2, culture: 1 },
          },
          {
            id: 'tt-project-entry-b',
            label: '达标改造后再表决',
            detail: '要求项目先提出减排、运输和本地用工方案，经独立评估与村民表决后再决定是否进入。',
            result: '评估周期拉长，项目方需增加治理投入。有条件准入可能兼顾收益与排放，但例外增加会让边界更依赖执行能力。',
            effects: { ecology: 0, livelihood: 2, culture: 0 },
          },
          {
            id: 'tt-project-entry-c',
            label: '先落地再持续监管',
            detail: '允许项目先行建设，通过在线监测、违约退出和收益提取环境金控制后续影响。',
            result: '就业与收入较快落地，环境风险也随之进入村庄。监管可积累治理资源，但监测失效或违约执行困难会放大损害。',
            effects: { ecology: -2, livelihood: 2, culture: -1 },
          },
        ],
      },
      {
        id: 'tt-rule-renewal',
        title: '老规矩由谁接着讲',
        situation: '环保委员会需要更新成员和议事方式，老成员熟悉历次否决，年轻经营者希望提高项目讨论效率，普通村民则要求更早知道环境影响。完全沿用旧程序较稳妥，却也难以吸收新的经验和分歧。',
        question: '村级环境规则更新时，专业判断与村民参与怎样组合？',
        choices: [
          {
            id: 'tt-rule-renewal-a',
            label: '老成员与专家主导',
            detail: '保留既有委员会核心，引入专业评估支持，村民主要在项目结论形成后了解结果。',
            result: '决策效率和专业连续性较高，普通村民参与较靠后。历史经验不易丢失，但规则可能逐渐变成少数人的专业语言。',
            effects: { ecology: 1, livelihood: 0, culture: -1 },
          },
          {
            id: 'tt-rule-renewal-b',
            label: '公开听证后共同表决',
            detail: '在项目初期公开环境信息，让村民、经营者和专家分别陈述，再由村庄共同表决。',
            result: '讨论时间和协调成本会增加，各方能更早看见分歧。参与有助于规则更新，但复杂信息也可能被短期收入诉求盖过。',
            effects: { ecology: 0, livelihood: 0, culture: 2 },
          },
          {
            id: 'tt-rule-renewal-c',
            label: '轮流进委员会审议',
            detail: '村民代表定期轮换参与项目审查，老成员提供案例记录，专家意见作为审议材料。',
            result: '新成员需要学习，审查速度可能放缓。更多家庭会理解规则形成过程，但轮换频繁也可能削弱经验积累。',
            effects: { ecology: 0, livelihood: -1, culture: 2 },
          },
        ],
      },
    ],
    reflection: '村级规则的力度来自长期执行，也来自村民是否仍能参与解释它。否决边界与议事程序，需要一起经受新项目的检验。',
  },
];

const JOURNEY_SITE_ORDER = [
  'qianjiangyuan',
  'xiajiang',
  'yucun',
  'xinxinqiao',
  'pujiang',
  'yunhe',
  'xixi',
  'dachendao',
  'sangji',
  'tengtou',
];

const textLength = (value) => Array.from(value).length;
const between = (value, min, max) => textLength(value) >= min && textLength(value) <= max;

export function validateJourney() {
  const errors = [];
  const ids = new Set();
  const decisions = JOURNEY_CHAPTERS.flatMap((chapter) => chapter.decisions);
  const choices = decisions.flatMap((decision) => decision.choices);
  const requiredIntro = ['title', 'kicker', 'description', 'scenarioNote'];
  const requiredChapter = ['id', 'siteId', 'title', 'subtitle', 'evidence', 'context', 'decisions', 'reflection'];
  const requiredDecision = ['id', 'title', 'situation', 'question', 'choices'];
  const requiredChoice = ['id', 'label', 'detail', 'result', 'effects'];
  const requireFields = (value, fields, path) => {
    fields.forEach((field) => {
      if (!Object.hasOwn(value, field)) errors.push(`${path} 缺少 ${field}`);
    });
  };
  const checkId = (id, path) => {
    if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) errors.push(`${path} ID 无效`);
    if (ids.has(id)) errors.push(`${path} ID 重复`);
    ids.add(id);
  };
  const checkText = (value, min, max, path) => {
    if (typeof value !== 'string' || !between(value, min, max)) {
      errors.push(`${path} 字数为 ${typeof value === 'string' ? textLength(value) : '无效'}，要求 ${min} 至 ${max}`);
    }
  };

  requireFields(JOURNEY_INTRO, requiredIntro, 'JOURNEY_INTRO');
  if (JOURNEY_CHAPTERS.length !== 10) errors.push('章节数不是 10');
  if (decisions.length !== 20) errors.push('设问数不是 20');
  if (choices.length !== 60) errors.push('选项数不是 60');

  JOURNEY_CHAPTERS.forEach((chapter, chapterIndex) => {
    const path = chapter.id || `章节 ${chapterIndex}`;
    requireFields(chapter, requiredChapter, path);
    checkId(chapter.id, path);
    if (chapter.id !== JOURNEY_SITE_ORDER[chapterIndex] || chapter.siteId !== chapter.id) {
      errors.push(`${path} 顺序或 siteId 错误`);
    }
    if (!chapter.evidence?.text || !chapter.evidence?.source) errors.push(`${path} evidence 不完整`);
    checkText(chapter.context, 70, 110, `${path}.context`);
    checkText(chapter.reflection, 45, 80, `${path}.reflection`);
    if (chapter.decisions.length !== 2) errors.push(`${path} 设问数不是 2`);

    chapter.decisions.forEach((decision) => {
      const decisionPath = `${path}.${decision.id}`;
      requireFields(decision, requiredDecision, decisionPath);
      checkId(decision.id, decisionPath);
      checkText(decision.situation, 70, 140, `${decisionPath}.situation`);
      if (!decision.question?.endsWith('？')) errors.push(`${decisionPath}.question 不是设问`);
      if (decision.choices.length !== 3) errors.push(`${decisionPath} 选项数不是 3`);
      const effectSignatures = new Set();

      decision.choices.forEach((choice) => {
        const choicePath = `${decisionPath}.${choice.id}`;
        requireFields(choice, requiredChoice, choicePath);
        checkId(choice.id, choicePath);
        if (typeof choice.label !== 'string' || textLength(choice.label) > 14) errors.push(`${choicePath}.label 超过 14 字`);
        checkText(choice.detail, 30, 65, `${choicePath}.detail`);
        checkText(choice.result, 45, 100, `${choicePath}.result`);
        ['ecology', 'livelihood', 'culture'].forEach((key) => {
          const value = choice.effects?.[key];
          if (!Number.isInteger(value) || value < -2 || value > 2) errors.push(`${choicePath}.effects.${key} 越界`);
        });
        effectSignatures.add(JSON.stringify(choice.effects));
      });
      if (effectSignatures.size !== 3) errors.push(`${decisionPath} 三个选项的 effects 未区分`);
    });
  });

  const stats = {
    chapters: JOURNEY_CHAPTERS.length,
    decisions: decisions.length,
    choices: choices.length,
    characters: textLength(JSON.stringify({ intro: JOURNEY_INTRO, chapters: JOURNEY_CHAPTERS })),
    context: [Math.min(...JOURNEY_CHAPTERS.map((chapter) => textLength(chapter.context))), Math.max(...JOURNEY_CHAPTERS.map((chapter) => textLength(chapter.context)))],
    situation: [Math.min(...decisions.map((decision) => textLength(decision.situation))), Math.max(...decisions.map((decision) => textLength(decision.situation)))],
    label: [Math.min(...choices.map((choice) => textLength(choice.label))), Math.max(...choices.map((choice) => textLength(choice.label)))],
    detail: [Math.min(...choices.map((choice) => textLength(choice.detail))), Math.max(...choices.map((choice) => textLength(choice.detail)))],
    result: [Math.min(...choices.map((choice) => textLength(choice.result))), Math.max(...choices.map((choice) => textLength(choice.result)))],
    reflection: [Math.min(...JOURNEY_CHAPTERS.map((chapter) => textLength(chapter.reflection))), Math.max(...JOURNEY_CHAPTERS.map((chapter) => textLength(chapter.reflection)))],
  };

  return { valid: errors.length === 0, errors, stats };
}

export const JOURNEY_VALIDATION = validateJourney();

if (!JOURNEY_VALIDATION.valid) {
  throw new Error(`Journey 数据校验失败：${JOURNEY_VALIDATION.errors.join('；')}`);
}

export default JOURNEY_CHAPTERS;
