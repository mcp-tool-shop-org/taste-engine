<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/taste-engine/readme.png" alt="Taste Engine" width="400">
</p>

<h3 align="center">Canon-and-judgment system for creative and product work</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@mcptoolshop/taste-engine"><img src="https://img.shields.io/npm/v/@mcptoolshop/taste-engine" alt="npm version"></a>
  <a href="https://github.com/mcp-tool-shop-org/taste-engine/blob/main/LICENSE"><img src="https://img.shields.io/github/license/mcp-tool-shop-org/taste-engine" alt="license"></a>
  <a href="https://github.com/mcp-tool-shop-org/taste-engine"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="node version"></a>
</p>

---

"टेस्ट इंजन" किसी रिपॉजिटरी के नियमों (रीडमी फाइलें, आर्किटेक्चर दस्तावेज़, डिज़ाइन नोट्स) को पढ़ता है, मल्टी-पास एलएलएम विश्लेषण के माध्यम से महत्वपूर्ण कथनों को निकालता है, और फिर इन चयनित कथनों का उपयोग करके किसी भी नए फ़ाइल या घटक की जांच करता है ताकि यह सुनिश्चित किया जा सके कि वह नियमों के अनुरूप है। जब कोई विचलन (ड्रिफ्ट) पाया जाता है, तो यह सुधार के सुझाव या पूर्ण पुनर्निर्देशन उत्पन्न करता है - और यह सब स्थानीय रूप से ओलामा के साथ चलता है, जिसके लिए किसी भी भुगतान किए गए एपीआई की आवश्यकता नहीं होती है।

## खतरे का मॉडल।

"टेस्ट इंजन" केवल स्थानीय रूप से ही काम करता है। यह डिस्क से प्रोजेक्ट फ़ाइलें पढ़ता है, काम करने की स्थिति को एक स्थानीय SQLite डेटाबेस (`.taste/taste.db`) और JSON कैनन फ़ाइलों (`canon/`) में संग्रहीत करता है। इसका एकमात्र नेटवर्क कनेक्शन एक स्थानीय ओलामा इंस्टेंस से होता है, जो `127.0.0.1:11434` पर स्थित है। वैकल्पिक वर्कबेंच यूआई `localhost:3200` पर उपलब्ध है। कोई भी डेटा एकत्र नहीं किया जाता है। कोई भी गोपनीय जानकारी या क्रेडेंशियल संभाले नहीं जाते हैं। कोई भी डेटा आपके कंप्यूटर से बाहर नहीं जाता है।

## स्थापित करें।

```bash
npm install -g @mcptoolshop/taste-engine
```

इसके लिए [Node.js](https://nodejs.org/) का संस्करण 20 या उससे अधिक और [Ollama](https://ollama.ai/) की आवश्यकता है, जो आपके कंप्यूटर पर स्थापित होना चाहिए और जिसमें एक मॉडल डाउनलोड किया गया हो (उदाहरण के लिए, `ollama pull qwen2.5:14b`)।

## शुरुआत कैसे करें।

```bash
# Initialize a project
taste init my-project --root ./my-project

# Check environment health
taste doctor

# Ingest source artifacts (READMEs, docs, design notes)
taste ingest README.md docs/architecture.md

# Extract canon statements (multi-pass, Ollama-powered)
taste extract run

# Curate: review candidates, accept/reject/edit
taste curate queue
taste curate accept <id>

# Freeze canon version
taste curate freeze --tag v1

# Review an artifact against curated canon
taste review run path/to/artifact.md

# Run the workflow gate on changed files
taste gate run
```

## यह क्या करता है।

**सारांश:** - 8 विशेषीकृत उपकरण आपके स्रोत दस्तावेजों का विश्लेषण करते हैं ताकि शोध प्रस्तावों, डिज़ाइन नियमों, नकारात्मक प्रवृत्तियों, भाषा/नामकरण सम्मेलनों, और अन्य पहलुओं की पहचान की जा सके। जैकार्ड समानता के माध्यम से दोहराव का पता लगाया जाता है, जिससे समान निष्कर्षों को एक साथ समेकित किया जा सकता है।

**व्यवस्थापन:** मानव-आधारित व्यवस्थापन: निकाले गए विकल्पों को स्वीकार करें, अस्वीकार करें, संपादित करें, विलय करें या स्थगित करें। विसंगतियों को दूर करें। पुन: जांच के लिए संस्करणों को स्थिर करें।

**समीक्षा:** यह प्रणाली 4 आयामों (थीसिस का संरक्षण, पैटर्न की निष्ठा, नकारात्मक पैटर्न से टकराव, और भाषा/नामकरण की उपयुक्तता) के आधार पर मूल्यांकन करती है। एक निश्चित मूल्यांकन प्रणाली (जोड़ना → लगभग जोड़ना → सुधार योग्य विचलन → गंभीर विचलन → विरोधाभास) मॉडल को नियंत्रित करती है - नियमों को बदला नहीं जा सकता।

**मरम्मत:** त्रुटि की गंभीरता के आधार पर तीन प्रकार की मरम्मत विधियां:
- **पैच (Patch)** (1A) - सतह पर होने वाली मामूली त्रुटियों को ठीक करने के लिए न्यूनतम बदलाव।
- **संरचनात्मक (Structural)** (1B) - लक्ष्य का निष्कर्षण + त्रुटि का निदान + अवधारणा का प्रतिस्थापन।
- **पुनर्निर्देशन (Redirect)** (2C) - पूर्ण लक्ष्य परिवर्तन, जिसमें 2-3 संगत विकल्प शामिल हैं।

**गेट:** प्रवर्तन के तरीके (सलाह/चेतावनी/अनिवार्य) जो CI (निरंतर एकीकरण) के आउटपुट कोड के साथ जुड़े हैं, साथ ही रसीदों को रद्द करने की सुविधा और प्रत्येक प्रकार की सामग्री (आर्टिफैक्ट) के लिए अलग-अलग नियम।

**पोर्टफोलियो:** इसमें पहले से तैयार नीति सेटिंग्स वाले रिपॉजिटरी शामिल हैं, जो विभिन्न परियोजनाओं में होने वाले बदलावों का पता लगाते हैं, विकास के रुझानों को ट्रैक करते हैं, और "अपनाना" (एडॉप्शन) के लिए सुझाव उत्पन्न करते हैं।

**ऑर्ग (Org)**: यह एक नियंत्रण प्रणाली है जो कई रिपॉजिटरी (repository) के एक साथ उपयोग को प्रबंधित करती है। इसमें शामिल हैं: प्रमोशन कतारें (promotion queues), डिमोशन ट्रिगर (demotion triggers), 7 श्रेणियों वाला अलर्ट इंजन (alert engine), और ऑडिट रिकॉर्ड के साथ पूर्वावलोकन/लागू करना/वापस लेना (preview/apply/rollback) जैसी क्रियाएं।

**वॉचटावर:** यह एक ऐसा उपकरण है जो स्नैपशॉट के आधार पर परिवर्तनों का पता लगाता है, और इसमें डेल्टा इंजन और सारांश (डाइजेस्ट) बनाने की क्षमता है, जिससे दैनिक परिचालन संबंधी जानकारी प्राप्त की जा सकती है।

**वर्किंग बेंच:** यह एक डार्क थीम वाला रिएक्ट यूजर इंटरफेस है जो localhost:3200 पर उपलब्ध है। इसमें संगठन संरचना, कतारों, रिपॉजिटरी विवरण और क्रिया प्रबंधन के लिए 13 एपीआई एंडपॉइंट्स हैं।

## सीएलआई संदर्भ।

इन समूहों के अंतर्गत 68 कमांड (आदेश) व्यवस्थित किए गए हैं:

| समूह। | कमांड्स (आदेश) |
|-------|----------|
| `taste init` | परियोजना को शुरू करें। |
| `taste doctor` | पर्यावरण स्वास्थ्य जांच। |
| `taste ingest` | स्रोत सामग्री को शामिल करें। |
| `taste canon` | कैनन की स्थिति और प्रबंधन। |
| `taste extract` | "रन एक्सट्रैक्शन (रन निष्कर्षण) करें, और संभावित उम्मीदवारों, विरोधाभासों और उदाहरणों को देखें।" |
| `taste curate` | पंक्ति, स्वीकार करें, अस्वीकार करें, संपादित करें, विलय करें, स्थिर करें। |
| `taste review` | चलाए गए कार्यों की समीक्षा करें, परिणामों की सूची देखें, और डेटा पैकेटों का अवलोकन करें। |
| `taste calibrate` | प्रतिक्रिया, सारांश, कथन, निष्कर्ष। |
| `taste revise` | "परिवर्तन (पैच) की समीक्षा को फिर से किया गया।" |
| `taste repair` | गहरी दरार के लिए संरचनात्मक मरम्मत। |
| `taste redirect` | मरम्मत न हो सकने वाले प्राचीन वस्तुओं के लिए, पुनर्निर्देशन लक्ष्य निर्धारित करना। |
| `taste gate` | रन गेट, नीति प्रबंधन, रिकॉर्ड ओवरराइड, कार्यान्वयन रिपोर्ट. |
| `taste onboard` | रिपो (Repo) का एकीकरण, रिपोर्टें, और सुझाव। |
| `taste portfolio` | क्रॉस-रिपॉजिटरी मैट्रिक्स, निष्कर्ष, निर्यात। |
| `taste org` | ऑर्ग मैट्रिक्स, कतारें, अलर्ट, क्रियाएं (पूर्वावलोकन/लागू करें/वापस लें)। |
| `taste watchtower` | स्कैन, इतिहास, डेल्टा, सार/संक्षेप. |
| `taste workbench` | ऑपरेटर वेब यूआई शुरू करें। |

पूर्ण उपयोग के लिए `taste --help` या `taste <कमांड> --help` चलाएं।

## आर्किटेक्चर

```
src/
  core/         # Schema, types, enums, validation (Zod), IDs
  db/           # SQLite persistence, migrations
  canon/        # Canon store, versioning, file I/O
  extraction/   # 8-pass extraction, prompts, consolidation
  review/       # Canon packet, dimension prompts, verdict synthesis
  revision/     # Patch revision engine
  repair/       # Structural repair (goal → fault → concept → draft)
  redirect/     # Goal redirection briefs
  gate/         # Workflow gate, policy, overrides, rollout reports
  onboard/      # Source scanner, presets, recommendations
  portfolio/    # Cross-repo intelligence
  org/          # Org control plane, alerts, actions
  watchtower/   # Snapshot engine, delta, digest
  workbench/    # Express API + React UI
  cli/          # Commander CLI (68 commands)
  util/         # JSON, timestamps, Ollama client
```

## समर्थित प्लेटफॉर्म

- **ऑपरेटिंग सिस्टम:** विंडोज, macOS, लिनक्स
- **रनटाइम:** Node.js >= 20
- **एलएलएम:** ओलामा (स्थानीय) — qwen2.5:14b के साथ परीक्षण किया गया।

## लाइसेंस

[एमआईटी](LICENSE)

---

<p align="center">
  Built by <a href="https://github.com/mcp-tool-shop-org">mcp-tool-shop</a>
</p>
