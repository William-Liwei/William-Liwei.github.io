window.ABOUT_DATA = {
  personalInfo: {
    email: "liwei008009@163.com",
    github: "https://github.com/William-Liwei",
    googleScholar: "https://scholar.google.com/citations?user=jLPVuhoAAAAJ",
    orcid: "https://orcid.org/0009-0008-8108-4854"
  },
  news: [
    { year: 2026, month: 3, content: "Be invited to serve as a <strong>Reviewer</strong> at <strong>ICANN 2026 (CCF-C)</strong>." },
    { year: 2026, month: 2, content: "One paper accepted for <strong>Oral Presentation</strong> at <strong>DASFAA 2026 (CCF-B)</strong>." },
    { year: 2026, month: 3, content: "Advanced to the finals of the <strong>ASC Student Supercomputer Challenge</strong>." },
    { year: 2026, month: 1, content: "Two papers (ScatterFusion, AWGFormer) accepted for <strong>Poster Presentation</strong> at <strong>ICASSP 2026 (CCF-B)</strong>." },
    { year: 2026, month: 1, content: "Honored to be awarded the <strong>Xiaomi Scholarship</strong>" },
    { year: 2025, month: 9, content: "Honored to be awarded the <strong>Shanghai Scholarship</strong> in recognition of a fruitful year, which included ranking <strong>#1 in GPA</strong>, publishing four first-author papers in <strong>CCF-C</strong> ranked conferences, and winning multiple national programming contest awards." },
    { year: 2025, month: 8, content: "Awarded First Prize in the <strong>Baidu Star Programming Contest - Talent Track</strong> and <strong>MaTiBei Collegiate Programming Contest</strong>." },
    { year: 2025, month: 6, content: "Two papers (SWIFT, TimeFlowDiffuser) accepted for <strong>Oral Presentation</strong> at <strong>ICANN 2025 (CCF-C)</strong>." },
    { year: 2025, month: 5, content: "Two papers (LWSpace, EnergyPatchTST) accepted for <strong>Oral Presentation</strong> at <strong>ICIC 2025 (CCF-C)</strong>." },
    { year: 2025, month: 5, content: "The self-developed <strong>CCF-Online</strong> academic conference portal is now live." },
    { year: 2024, month: 11, content: "Awarded Second Prize in the 'E-Cloud Cup' Shanghai Collegiate Cloud Computing Application Contest." },
    { year: 2024, month: 7, content: "Awarded Gold Medal in the university-level China 'Internet+' Innovation Competition." }
  ],
  publications: [
    {
      title: "ScatterFusion: A Hierarchical Scattering Transform Framework for Enhanced Time Series Forecasting",
      authors: "<strong>Li, W.</strong>",
      venue: "IEEE International Conference on Acoustics, Speech, and Signal Processing (ICASSP 2026)",
      year: 2026,
      month: 1,
      badges: [{ type: "ccf", text: "CCF-B" }, { type: "author", text: "Sole Author" }],
      links: [],
      thumbnail: "scatterfusion.png",
      abstract: "Time series forecasting faces challenges in capturing multi-scale temporal patterns while maintaining computational efficiency. This paper introduces ScatterFusion, a novel framework that leverages hierarchical scattering transforms for enhanced time series prediction. Our approach integrates wavelet scattering networks with adaptive feature fusion mechanisms to extract robust multi-scale representations.",
      bibtex: `@inproceedings{li2026scatterfusion,
  title={ScatterFusion: A Hierarchical Scattering Transform Framework for Enhanced Time Series Forecasting},
  author={Li, Wei},
  booktitle={IEEE International Conference on Acoustics, Speech, and Signal Processing},
  year={2026}
}`
    },
    {
      title: "AWGFormer: Adaptive Wavelet-Guided Transformer for Multi-resolution Time Series Forecasting",
      authors: "<strong>Li, W.</strong>",
      venue: "IEEE International Conference on Acoustics, Speech, and Signal Processing (ICASSP 2026)",
      year: 2026,
      month: 1,
      badges: [{ type: "ccf", text: "CCF-B" }, { type: "author", text: "Sole Author" }],
      links: [],
      thumbnail: "awgformer.png",
      abstract: "Time series forecasting requires capturing patterns across multiple temporal scales while maintaining computational efficiency. This paper introduces AWGformer, a novel architecture that integrates adaptive wavelet decomposition with cross-scale attention mechanisms for enhanced multi-variate time series prediction.",
      bibtex: `@inproceedings{li2026awgformer,
  title={AWGFormer: Adaptive Wavelet-Guided Transformer for Multi-resolution Time Series Forecasting},
  author={Li, Wei},
  booktitle={IEEE International Conference on Acoustics, Speech, and Signal Processing},
  year={2026}
}`
    },
    {
      title: "TimeFlowDiffuser: A Hierarchical Diffusion Framework with Adaptive Context Sampling for Multi-Horizon Time Series Forecasting",
      authors: "<strong>Li, W.</strong>",
      venue: "International Conference on Artificial Neural Networks (ICANN 2025)",
      year: 2025,
      month: 6,
      badges: [{ type: "ccf", text: "CCF-C" }, { type: "oral", text: "Oral" }, { type: "author", text: "Sole Author" }],
      links: [],
      thumbnail: "timeflowdiffuser.png",
      abstract: "Diffusion models have shown promise in generative tasks but remain underexplored for time series forecasting. We introduce TimeFlowDiffuser, a hierarchical diffusion framework with adaptive context sampling for multi-horizon forecasting. The model achieves strong performance on benchmark datasets.",
      bibtex: `@inproceedings{li2025timeflowdiffuser,
  title={TimeFlowDiffuser: A Hierarchical Diffusion Framework with Adaptive Context Sampling for Multi-horizon Time Series Forecasting},
  author={Li, Wei},
  booktitle={International Conference on Artificial Neural Networks},
  pages={241--252},
  year={2025},
  organization={Springer}
}`
    },
    {
      title: "SWIFT: State-space Wavelet Integrated Forecasting Technology for Enhanced Time Series Prediction",
      authors: "<strong>Li, W.</strong>",
      venue: "International Conference on Artificial Neural Networks (ICANN 2025)",
      year: 2025,
      month: 6,
      badges: [{ type: "ccf", text: "CCF-C" }, { type: "oral", text: "Oral" }, { type: "author", text: "Sole Author" }],
      links: [{ type: "github", url: "https://github.com/William-Liwei/SWIFT" }],
      thumbnail: "swift.png",
      abstract: "We introduce SWIFT, a novel architecture that synergistically combines selective state space models (Mamba) with multi-scale dilated convolutions for enhanced time series forecasting. Experiments demonstrate SWIFT outperforms common methods, achieving 6.5% average improvement in MSE.",
      bibtex: `@inproceedings{li2025swift,
  title={SWIFT: State-Space Wavelet Integrated Forecasting Technology for Enhanced Time Series Prediction},
  author={Li, Wei},
  booktitle={International Conference on Artificial Neural Networks},
  pages={29--40},
  year={2025},
  organization={Springer}
}`
    },
    {
      title: "EnergyPatchTST: Multi-scale Time Series Transformers with Uncertainty Estimation for Energy Forecasting",
      authors: "<strong>Li, W.</strong>, Wang, Z., Sun, Q., Gao, Q., & Yang, F.",
      venue: "International Conference on Intelligent Computing (ICIC 2025)",
      year: 2025,
      month: 5,
      badges: [{ type: "ccf", text: "CCF-C" }, { type: "oral", text: "Oral" }, { type: "author", text: "First Author" }],
      links: [{ type: "github", url: "https://github.com/William-Liwei/EnergyPatchTST" }],
      thumbnail: "energypatchtst.png",
      abstract: "Energy forecasting is critical for grid management and renewable integration. We propose EnergyPatchTST, a multi-scale transformer architecture with uncertainty estimation tailored for energy time series. The model demonstrates strong performance on energy forecasting benchmarks.",
      bibtex: `@inproceedings{li2025energypatchtst,
  title={EnergyPatchTST: Multi-scale Time Series Transformers with Uncertainty Estimation for Energy Forecasting},
  author={Li, Wei and Wang, Zixin and Sun, Qizheng and Gao, Qixiang and Yang, Fenglei},
  booktitle={International Conference on Intelligent Computing},
  pages={319--330},
  year={2025},
  organization={Springer}
}`
    },
    {
      title: "LWSpace: Multi-Scale State Space Framework for Time Series Forecasting",
      authors: "<strong>Li, W.</strong>",
      venue: "International Conference on Intelligent Computing (ICIC 2025)",
      year: 2025,
      month: 5,
      badges: [{ type: "ccf", text: "CCF-C" }, { type: "oral", text: "Oral" }, { type: "author", text: "Sole Author" }],
      links: [],
      thumbnail: "lwspace.png",
      abstract: "State space models offer efficient sequence modeling but lack multi-scale capabilities. We introduce LWSpace, a multi-scale state space framework that captures temporal patterns at different resolutions. The model achieves competitive performance with improved efficiency.",
      bibtex: `@inproceedings{li2025lwspace,
  title={LWSpace: A Multi-scale State Space Framework for Enhanced Time Series Forecasting},
  author={Li, Wei},
  booktitle={International Conference on Intelligent Computing},
  pages={295--306},
  year={2025},
  organization={Springer}
}`
    },
    {
      title: "Olympic Medal Prediction via Adaptive Triple-Fusion: Combining AAC Model with ARIMA-State Space Dynamics",
      authors: "<strong>Li, W.</strong>, Wang, Z., Gao, Q., & Yang, F.",
      venue: "International Conference on Applied Mathematics, Modelling and Intelligent Computing (CAMMIC 2025)",
      year: 2025,
      month: 3,
      badges: [{ type: "ccf", text: "EI Index" }, { type: "poster", text: "Poster" }, { type: "author", text: "First Author" }],
      links: [],
      thumbnail: "olympic.png",
      abstract: "Olympic medal prediction requires modeling complex socio-economic and athletic factors. We propose an adaptive triple-fusion approach combining AAC models with ARIMA and state space dynamics for accurate medal forecasting.",
      bibtex: `@inproceedings{li2025olympic,
  title={Olympic Medal Prediction via Adaptive Triple-Fusion: Combining AAC Model with ARIMA-State Space Dynamics},
  author={Li, Wei and Wang, Zixin and Gao, Qixiang and Yang, Fenglei},
  booktitle={Proceedings of the 2025 5th International Conference on Applied Mathematics, Modelling and Intelligent Computing},
  pages={699--703},
  year={2025}
}`
    }
  ],
  engagement: [
    {
      type: "Reviewing",
      icon: "review",
      title: "Academic Service",
      items: [
        { event: "International Conference on Artificial Neural Networks (ICANN 2026)", role: "Reviewer" },
        { event: "AAAI Conference on Artificial Intelligence (AAAI 2026)", role: "Program Committee Member" },
        { event: "International Conference on Artificial Neural Networks (ICANN 2025)", role: "Reviewer (3 submissions)" }
      ]
    },
    {
      type: "Talks",
      icon: "talk",
      title: "Talks & Presentations",
      items: [
        { event: "Poster Presentation at ICASSP 2026", role: 'Presented "ScatterFusion" and "AWGformer"' },
        { event: "Oral Presentation at ICANN 2025", role: 'Presented "TimeFlowDiffuser" and "SWIFT"' },
        { event: "Oral Presentation at ICIC 2025", role: 'Presented "LWSpace" and "EnergyPatchTST"' },
        { event: "Grade meeting", role: "Invited Speaker on academic and research journey" }
      ]
    },
    {
      type: "Leadership",
      icon: "leadership",
      title: "Leadership & University Service",
      items: [
        { event: "Head of Management Dept., School Youth League Committee", role: "School" },
        { event: "Class League Branch Secretary", role: "Shanghai University" }
      ]
    }
  ],
  projects: [
    { title: "'CCF-Online' Academic Conference Portal", desc: "Independently developed and deployed an online portal that scrapes and integrates data from multiple sources to provide researchers with efficient access to academic conference information.", tags: ["Independent Project", "Scrapy", "JavaScript"], links: [{ type: "live_demo", url: "https://www.weili.space/ccf/" }] },
    { title: "SHU Prophet: An Intelligent Time-Series Forecasting & Decision Platform", desc: "Engineered 'SHU Prophet,' a full-stack intelligent platform for advanced time-series analysis. This project integrates a suite of self-developed models with an interactive AI Agent (LangChain & LLM) to automate data analysis, generate insightful reports, and bridge the gap between complex algorithms and intuitive decision-making.", tags: ["Time Series Forecasting", "Full-Stack", "AI Agent", "LangChain", "Vue.js", "Python", "Flask", "ECharts"], links: [{ type: "github", url: "https://github.com/William-Liwei/shuprophet" }, { type: "live_demo", url: "https://shuprophet.weili.space" }] },
    { title: "Cloud-based Automated Course Selection System", desc: "Led the development of a cloud-hosted system that automates the course selection process, featuring an LLM-based sentiment analysis module for course reviews. Award-winning project.", tags: ["Project Lead", "Flask", "Playwright", "Cloud Computing"], links: [] },
    { title: "Cultural Heritage Database System", desc: "Developed a digital management platform for the University's Key Laboratory of Silicate Cultural Heritage, supporting multi-source data entry, retrieval, and visualization.", tags: ["Database Design", "MySQL", "Data Visualization"], links: [] },
    { title: "Smart Parking IoT Platform", desc: "Designed and built a full-stack IoT parking solution, enabling real-time parking availability queries, reservations, and payments. Awarded Gold Medal at a university innovation competition.", tags: ["IoT", "Full-Stack", "Python", "Flask"], links: [] },
    { title: "Research on Product Assembly Strategy Optimization", desc: "Led a research project applying Bayesian decision networks and genetic algorithms to optimize complex assembly strategies for products with variable components and processes.", tags: ["Optimization", "Bayesian Networks", "Genetic Algorithms"], links: [] }
  ],
  honors: [
    { year: 2026, month: 5, name: "ASC Student Supercomputer Challenge", level: "International First Prize" },
    { year: 2026, month: 1, name: "Xiaomi Scholarship", level: "Xiaomi" },
    { year: 2025, month: 12, name: "Baidu Star Programming Contest", level: "Finalist" },
    { year: 2025, month: 11, name: "Special Class Scholarship for Academic Excellence", level: "Shanghai University (Top-tier)" },
    { year: 2025, month: 9, name: "Shanghai Scholarship", level: "Shanghai" },
    { year: 2025, month: 8, name: "Baidu Star Programming Contest - Talent Track", level: "National First Prize" },
    { year: 2025, month: 8, name: "MaTiBei Collegiate Programming Contest", level: "National First Prize" },
    { year: 2025, month: 7, name: "Information Security and Countermeasures Contest", level: "National Second Prize" },
    { year: 2025, month: 1, name: "'Jie-Yi' Student Leadership Scholarship", level: "School of Computer Engineering and Science" },
    { year: 2025, month: 5, name: "Lanqiao Cup Programming Contest", level: "Provincial Second Prize" },
    { year: 2024, month: 12, name: "Contemporary Undergraduate Mathematical Contest in Modeling", level: "Provincial Third Prize" },
    { year: 2024, month: 11, name: "'E-Cloud Cup' Shanghai Collegiate Cloud Computing Application Contest", level: "Second Prize" },
    { year: 2024, month: 10, name: "Special Class Scholarship for Academic Excellence", level: "Shanghai University (Top-tier)" },
    { year: 2024, month: 7, name: "China 'Internet+' Innovation Competition", level: "Gold Medal (University Level)" },
    { year: 2024, month: 10, name: "Undergraduate Academic Forum", level: "Second Prize" }
  ],
  experience: [
    {
      type: "Research",
      title: "Probabilistic Time Series Modeling",
      affiliation: "Remote Research | Advisors: <strong>Prof. Peilin Zhao</strong> (SJTU) & <strong>Dr. Shibo Feng</strong> (NTU)",
      year_start: 2025,
      month_start: 10,
      year_end: null,
      month_end: null,
      details: [
        "Investigating probabilistic frameworks for time series forecasting to model uncertainty.",
        "Exploring advanced generative models, including Variational Autoencoders (VAEs) and methodologies like Low-Rank Adaptation (LoRA) for efficient model fine-tuning."
      ]
    },
    {
      type: "Research",
      title: "Pattern Recognition & Machine Learning",
      affiliation: "Research Study | Advisor: <strong>Prof. Yuchun Fang</strong> (Shanghai University)",
      year_start: 2025,
      month_start: 10,
      year_end: null,
      month_end: null,
      details: [
        "Conducted in-depth research on pattern recognition and advanced machine learning techniques.",
        "Focused on the application of deep learning and large-scale models across various real-world scenarios."
      ]
    },
    {
      type: "Part-time",
      title: "AI Trainer / SFT Specialist",
      affiliation: "ByteDance | Xpert Program",
      year_start: 2025,
      month_start: 8,
      year_end: null,
      month_end: null,
      details: [
        "Performed expert-level data annotation and curation for Supervised Fine-Tuning (SFT) of large-scale language models.",
        "Authored and refined high-quality instruction-following data, focusing on complex reasoning, search query generation, and tool usage.",
        "Contributed to enhancing the model's capabilities in logical deduction, factual accuracy, and safety alignment."
      ]
    },
    {
      type: "Research",
      title: "Time Series Forecasting & Deep Learning",
      affiliation: "Independent Research | Advisor: <strong>Prof. Fenglei Yang</strong> (Shanghai University)",
      year_start: 2024,
      month_start: 1,
      year_end: null,
      month_end: null,
      details: [
        "Focused on multi-scale time series modeling and long-term forecasting challenges.",
        "Researched and developed novel architectures involving State Space Models (SSM), Transformers, and Diffusion Models.",
        "Achieved significant performance improvements on various forecasting benchmarks, leading to multiple publications."
      ]
    },
    {
      type: "Research",
      title: "Cultural Heritage Data Management",
      affiliation: "Undergraduate Researcher | Key Laboratory of Silicate Cultural Heritage Protection, Shanghai University | Advisor: <strong>Prof. Shunbo Hu</strong>",
      year_start: 2024,
      month_start: 3,
      year_end: null,
      month_end: null,
      details: [
        "Developed a specialized database using MySQL and Streamlit for managing cultural heritage data (Buddhist head sculptures).",
        "Participated in data analysis and management tasks related to cultural relic preservation."
      ]
    }
  ]
};
