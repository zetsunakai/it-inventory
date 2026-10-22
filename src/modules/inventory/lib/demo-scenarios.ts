// Studi kasus data demo inventory (mode pure backend seperti generator demo hmx-002 tanpa AI):
// 10 industri yang umum di kawasan berikat. Semua memakai alur 45 hari yang sama (lihat
// server/demo-data.ts); yang berbeda produk, kode HS, partner, qty, dan alasannya. Kode HS diambil
// dari referensi kepabeanan, jadi produk langsung siap dokumen BC.

export type DemoUom = "M" | "PCS" | "KG" | "L" | "M3"

export type DemoMaterial = {
  key: string
  sku: string
  name: string
  uom: DemoUom
  hs: string
  // Impor masuk rak bahan impor (calon BC 2.3), lokal ke rak bahan lokal (calon BC 4.0).
  source: "import" | "local"
  receive: number
  // Dipakai produksi barang jadi A dan B.
  use: [number, number]
}

export type DemoPartner = [name: string, address: string, country: string]

export type DemoScenario = {
  key: string
  // Awalan kode gudang, lokasi, produk, dan partner, mis. GRM-GBB, GRM-KAIN-TWL.
  prefix: string
  title: string
  location: string
  story: string
  // Kode batch produksi barang jadi A dan B, mis. KM, CH → KM-2601, CH-2601.
  batch: [string, string]
  materials: DemoMaterial[]
  // Kemasan: diterima di rak bahan lokal, dipindah ke gudang barang jadi, ikut terkirim saat ekspor.
  packaging: {
    sku: string
    name: string
    hs: string
    receive: number
    move: number
    exportUse: number
    inTransit: number
  }
  // A: diekspor dan ada yang reject; sisanya kurang untuk ekspor berikutnya (Sebagian tersedia).
  // B: diekspor dan dijual lokal, ada retur dari pembeli lokal; sisanya cukup untuk jual lokal.
  finished: [
    {
      sku: string
      name: string
      uom: DemoUom
      hs: string
      produce: number
      export: number
      reject: number
    },
    {
      sku: string
      name: string
      uom: DemoUom
      hs: string
      produce: number
      export: number
      local: number
      returned: number
      localPending: number
    },
  ]
  scrap: { sku: string; name: string; hs: string; produce: number; sold: number }
  // Bahan impor cacat diretur ke pemasok; bahan rusak di gudang menunggu persetujuan scrap.
  defect: { material: string; qty: number; reason: string }
  damage: { material: string; qty: number; reason: string }
  // Pekerjaan hari ini: kontainer bahan impor kedua (Siap) dan order bahan lokal (Draft).
  pendingImport: { material: string; qty: number }
  pendingLocal: { material: string; qty: number }
  returnReason: string
  rejectReason: string
  partners: {
    importVendor: DemoPartner
    localVendor: DemoPartner
    packagingVendor: DemoPartner
    exportBuyer: DemoPartner
    exportBuyer2: DemoPartner
    localBuyer: DemoPartner
    collector: DemoPartner
  }
}

// Ekspor berikutnya barang jadi A sengaja melebihi sisa stoknya 15 unit (Sebagian tersedia).
export const PENDING_EXPORT_SHORTFALL = 15

export const DEMO_SCENARIOS = [
  {
    key: "garmen",
    prefix: "GRM",
    title: "Garmen ekspor",
    location: "Cikarang, Bekasi",
    story: "Kain impor dan aksesoris lokal dijahit menjadi kemeja dan celana chino untuk ekspor.",
    batch: ["KM", "CH"],
    materials: [
      {
        key: "plain",
        sku: "GRM-KAIN-PLN",
        name: "Kain katun plain 150 cm",
        uom: "M",
        hs: "52083200",
        source: "import",
        receive: 2000,
        use: [900, 0],
      },
      {
        key: "twill",
        sku: "GRM-KAIN-TWL",
        name: "Kain katun twill 150 cm",
        uom: "M",
        hs: "52113200",
        source: "import",
        receive: 3000,
        use: [0, 1200],
      },
      {
        key: "benang",
        sku: "GRM-BNG-PES",
        name: "Benang jahit polyester (cone)",
        uom: "PCS",
        hs: "54011090",
        source: "local",
        receive: 400,
        use: [100, 120],
      },
      {
        key: "kancing",
        sku: "GRM-KCG-PLS",
        name: "Kancing plastik 4 lubang",
        uom: "PCS",
        hs: "96062100",
        source: "local",
        receive: 20000,
        use: [8000, 0],
      },
      {
        key: "resleting",
        sku: "GRM-RSL-LGM",
        name: "Resleting logam 18 cm",
        uom: "PCS",
        hs: "96071100",
        source: "local",
        receive: 3000,
        use: [0, 1000],
      },
      {
        key: "label",
        sku: "GRM-LBL-WVN",
        name: "Label tenun merek",
        uom: "PCS",
        hs: "58071000",
        source: "local",
        receive: 12000,
        use: [1000, 1000],
      },
    ],
    packaging: {
      sku: "GRM-KTN-BOX",
      name: "Karton box ekspor",
      hs: "48191000",
      receive: 800,
      move: 600,
      exportUse: 500,
      inTransit: 100,
    },
    finished: [
      {
        sku: "GRM-KMJ-PJG",
        name: "Kemeja pria lengan panjang katun",
        uom: "PCS",
        hs: "62052090",
        produce: 1000,
        export: 800,
        reject: 15,
      },
      {
        sku: "GRM-CLN-CHN",
        name: "Celana chino pria katun",
        uom: "PCS",
        hs: "62034290",
        produce: 1000,
        export: 700,
        local: 150,
        returned: 10,
        localPending: 100,
      },
    ],
    scrap: {
      sku: "GRM-SCR-KAIN",
      name: "Sisa potongan kain",
      hs: "63109010",
      produce: 85,
      sold: 60,
    },
    defect: { material: "plain", qty: 150, reason: "Cacat warna (shading) saat inspeksi kain" },
    damage: { material: "twill", qty: 25, reason: "Kain basah terkena rembesan atap gudang" },
    pendingImport: { material: "twill", qty: 2500 },
    pendingLocal: { material: "benang", qty: 300 },
    returnReason: "Salah ukuran (size 34 terkirim size 32)",
    rejectReason: "Reject jahitan hasil QC akhir",
    partners: {
      importVendor: ["Zhejiang Demo Textile Co., Ltd.", "Shaoxing, Zhejiang", "CN"],
      localVendor: ["PT Benang Sejahtera Demo", "Jl. Industri Tekstil 8, Bandung", "ID"],
      packagingVendor: ["PT Karton Prima Demo", "Kawasan Industri Jababeka, Bekasi", "ID"],
      exportBuyer: ["Northwind Apparel Inc. (demo)", "New York, NY", "US"],
      exportBuyer2: ["Sakura Fashion K.K. (demo)", "Osaka", "JP"],
      localBuyer: ["PT Ritel Mode Nusantara Demo", "Jl. Gatot Subroto 12, Jakarta", "ID"],
      collector: ["CV Daur Ulang Tekstil Demo", "Jl. Raya Cikarang 21, Bekasi", "ID"],
    },
  },
  {
    key: "sepatu",
    prefix: "SPT",
    title: "Sepatu olahraga",
    location: "Tangerang, Banten",
    story: "Kulit sintetis dan sol impor dirakit menjadi sepatu lari dan sepatu kasual.",
    batch: ["RN", "CS"],
    materials: [
      {
        key: "kulit",
        sku: "SPT-PU-SNT",
        name: "Kulit sintetis PU",
        uom: "M",
        hs: "59032000",
        source: "import",
        receive: 4000,
        use: [1500, 1200],
      },
      {
        key: "sol",
        sku: "SPT-SOL-KRT",
        name: "Sol karet cetak (pasang)",
        uom: "PCS",
        hs: "64062010",
        source: "import",
        receive: 6000,
        use: [2400, 1800],
      },
      {
        key: "lem",
        sku: "SPT-LEM-PU",
        name: "Lem sepatu PU",
        uom: "KG",
        hs: "35069900",
        source: "local",
        receive: 500,
        use: [150, 120],
      },
      {
        key: "tali",
        sku: "SPT-TALI-PES",
        name: "Tali sepatu poliester",
        uom: "PCS",
        hs: "63079090",
        source: "local",
        receive: 6000,
        use: [2400, 1800],
      },
      {
        key: "benang",
        sku: "SPT-BNG-NLN",
        name: "Benang jahit nilon (cone)",
        uom: "PCS",
        hs: "54011090",
        source: "local",
        receive: 300,
        use: [80, 60],
      },
    ],
    packaging: {
      sku: "SPT-KTK-SPT",
      name: "Kotak sepatu karton",
      hs: "48191000",
      receive: 5000,
      move: 4000,
      exportUse: 3500,
      inTransit: 500,
    },
    finished: [
      {
        sku: "SPT-LARI-PR",
        name: "Sepatu lari pria (pasang)",
        uom: "PCS",
        hs: "64041190",
        produce: 2400,
        export: 2000,
        reject: 30,
      },
      {
        sku: "SPT-KSL-WN",
        name: "Sepatu kasual wanita (pasang)",
        uom: "PCS",
        hs: "64041990",
        produce: 1800,
        export: 1200,
        local: 400,
        returned: 12,
        localPending: 150,
      },
    ],
    scrap: {
      sku: "SPT-SCR-PU",
      name: "Sisa potongan kulit sintetis",
      hs: "39159090",
      produce: 140,
      sold: 100,
    },
    defect: { material: "kulit", qty: 200, reason: "Lapisan PU mengelupas saat uji tekuk" },
    damage: { material: "sol", qty: 40, reason: "Sol berubah bentuk karena suhu gudang" },
    pendingImport: { material: "kulit", qty: 3000 },
    pendingLocal: { material: "lem", qty: 200 },
    returnReason: "Ukuran tidak sesuai pesanan",
    rejectReason: "Lem sol terbuka saat QC akhir",
    partners: {
      importVendor: ["Dongguan Demo Footwear Material Co.", "Dongguan, Guangdong", "CN"],
      localVendor: ["PT Kimia Perekat Demo", "Jl. Raya Serang KM 12, Tangerang", "ID"],
      packagingVendor: ["PT Karton Banten Demo", "Cikupa, Tangerang", "ID"],
      exportBuyer: ["Peak Runner GmbH (demo)", "Herzogenaurach", "DE"],
      exportBuyer2: ["Sole Avenue Ltd. (demo)", "Melbourne", "AU"],
      localBuyer: ["PT Sepatu Retail Indonesia Demo", "Jl. Daan Mogot 88, Jakarta", "ID"],
      collector: ["CV Daur Ulang Karet Demo", "Jl. Industri 5, Tangerang", "ID"],
    },
  },
  {
    key: "elektronik",
    prefix: "ELK",
    title: "Perakitan elektronik",
    location: "Batam, Kepulauan Riau",
    story: "PCB, IC, dan kapasitor impor dirakit menjadi adaptor daya dan modul pengendali.",
    batch: ["AD", "MD"],
    materials: [
      {
        key: "pcb",
        sku: "ELK-PCB-2S",
        name: "PCB dua sisi",
        uom: "PCS",
        hs: "85340020",
        source: "import",
        receive: 10000,
        use: [4000, 3000],
      },
      {
        key: "ic",
        sku: "ELK-IC-PWR",
        name: "IC kontroler daya",
        uom: "PCS",
        hs: "85423100",
        source: "import",
        receive: 12000,
        use: [4000, 6000],
      },
      {
        key: "kapasitor",
        sku: "ELK-KAP-MLC",
        name: "Kapasitor keramik multilayer",
        uom: "PCS",
        hs: "85322400",
        source: "import",
        receive: 200000,
        use: [80000, 60000],
      },
      {
        key: "kabel",
        sku: "ELK-KBL-INS",
        name: "Kabel listrik berinsulasi",
        uom: "M",
        hs: "85444294",
        source: "local",
        receive: 8000,
        use: [4000, 0],
      },
      {
        key: "casing",
        sku: "ELK-CSG-ABS",
        name: "Casing plastik ABS",
        uom: "PCS",
        hs: "39269099",
        source: "local",
        receive: 10000,
        use: [4000, 3000],
      },
    ],
    packaging: {
      sku: "ELK-KTN-BOX",
      name: "Karton box 40x30",
      hs: "48191000",
      receive: 2000,
      move: 1500,
      exportUse: 1200,
      inTransit: 200,
    },
    finished: [
      {
        sku: "ELK-ADP-12V",
        name: "Adaptor daya 12V",
        uom: "PCS",
        hs: "85044090",
        produce: 4000,
        export: 3200,
        reject: 60,
      },
      {
        sku: "ELK-MOD-IOT",
        name: "Modul pengendali IoT",
        uom: "PCS",
        hs: "85176249",
        produce: 3000,
        export: 2000,
        local: 600,
        returned: 20,
        localPending: 300,
      },
    ],
    scrap: {
      sku: "ELK-SCR-PCB",
      name: "Sisa PCB dan tembaga",
      hs: "74040000",
      produce: 60,
      sold: 45,
    },
    defect: { material: "ic", qty: 300, reason: "Tidak lolos uji fungsi saat incoming QC" },
    damage: { material: "casing", qty: 50, reason: "Casing retak karena tumpukan terlalu tinggi" },
    pendingImport: { material: "pcb", qty: 8000 },
    pendingLocal: { material: "casing", qty: 5000 },
    returnReason: "Konektor longgar ditemukan pelanggan",
    rejectReason: "Gagal uji burn-in",
    partners: {
      importVendor: ["Shenzhen Demo Electronics Ltd.", "Shenzhen, Guangdong", "CN"],
      localVendor: ["PT Plastik Presisi Batam Demo", "Batamindo Industrial Park, Batam", "ID"],
      packagingVendor: ["PT Kemas Batam Demo", "Kabil, Batam", "ID"],
      exportBuyer: ["Lionheart Devices Pte. Ltd. (demo)", "Singapore", "SG"],
      exportBuyer2: ["Nordic Smart Home AB (demo)", "Gothenburg", "SE"],
      localBuyer: [
        "PT Distribusi Elektronik Nusantara Demo",
        "Jl. Mangga Dua Raya 10, Jakarta",
        "ID",
      ],
      collector: ["CV Pengolah Limbah Elektronik Demo", "Jl. Sungai Harapan 3, Batam", "ID"],
    },
  },
  {
    key: "furnitur",
    prefix: "FRN",
    title: "Furnitur kayu",
    location: "Semarang, Jawa Tengah",
    story: "Kayu jati lokal dan kain jok impor diolah menjadi kursi dan meja makan untuk ekspor.",
    batch: ["KR", "MJ"],
    materials: [
      {
        key: "kainJok",
        sku: "FRN-KAIN-JOK",
        name: "Kain jok polyester",
        uom: "M",
        hs: "55121900",
        source: "import",
        receive: 3000,
        use: [1500, 0],
      },
      {
        key: "busa",
        sku: "FRN-BUSA-PU",
        name: "Lembar busa jok PU",
        uom: "PCS",
        hs: "39211399",
        source: "import",
        receive: 2000,
        use: [900, 0],
      },
      {
        key: "jati",
        sku: "FRN-JATI-GRG",
        name: "Kayu jati gergajian",
        uom: "M3",
        hs: "44072998",
        source: "local",
        receive: 60,
        use: [20, 25],
      },
      {
        key: "lem",
        sku: "FRN-LEM-PVA",
        name: "Lem kayu PVAc",
        uom: "KG",
        hs: "35069900",
        source: "local",
        receive: 400,
        use: [100, 150],
      },
      {
        key: "cat",
        sku: "FRN-CAT-MLM",
        name: "Melamine finishing",
        uom: "L",
        hs: "32089090",
        source: "local",
        receive: 1200,
        use: [300, 500],
      },
      {
        key: "engsel",
        sku: "FRN-ENGSEL",
        name: "Engsel dan baut rakit (set)",
        uom: "PCS",
        hs: "83021000",
        source: "local",
        receive: 4000,
        use: [900, 1200],
      },
    ],
    packaging: {
      sku: "FRN-KTN-EKS",
      name: "Karton dan pallet ekspor",
      hs: "48191000",
      receive: 1500,
      move: 1100,
      exportUse: 900,
      inTransit: 150,
    },
    finished: [
      {
        sku: "FRN-KRS-JOK",
        name: "Kursi makan jati berjok",
        uom: "PCS",
        hs: "94016100",
        produce: 900,
        export: 700,
        reject: 10,
      },
      {
        sku: "FRN-MJA-MKN",
        name: "Meja makan jati 6 kursi",
        uom: "PCS",
        hs: "94036090",
        produce: 600,
        export: 400,
        local: 120,
        returned: 4,
        localPending: 50,
      },
    ],
    scrap: {
      sku: "FRN-SCR-KYU",
      name: "Serbuk dan serpih kayu",
      hs: "44014900",
      produce: 900,
      sold: 700,
    },
    defect: { material: "kainJok", qty: 120, reason: "Warna kain tidak sesuai sampel" },
    damage: { material: "jati", qty: 2, reason: "Kayu retak karena kadar air tinggi" },
    pendingImport: { material: "kainJok", qty: 2000 },
    pendingLocal: { material: "jati", qty: 30 },
    returnReason: "Permukaan meja tergores saat pengiriman",
    rejectReason: "Sambungan kursi goyang saat uji beban",
    partners: {
      importVendor: ["Foshan Demo Upholstery Co.", "Foshan, Guangdong", "CN"],
      localVendor: ["PT Jati Lestari Demo", "Jl. Raya Jepara-Kudus KM 8, Jepara", "ID"],
      packagingVendor: [
        "PT Kemasan Jawa Tengah Demo",
        "Kawasan Industri Wijayakusuma, Semarang",
        "ID",
      ],
      exportBuyer: ["Oakwood Living Inc. (demo)", "Los Angeles, CA", "US"],
      exportBuyer2: ["Maison Bois SARL (demo)", "Lyon", "FR"],
      localBuyer: ["PT Interior Rumah Demo", "Jl. Pemuda 45, Semarang", "ID"],
      collector: ["CV Biomassa Kayu Demo", "Jl. Kaligawe 7, Semarang", "ID"],
    },
  },
  {
    key: "mainan",
    prefix: "MNN",
    title: "Mainan plastik",
    location: "Tangerang, Banten",
    story: "Biji plastik ABS impor dicetak menjadi mobil-mobilan, ditambah puzzle karton.",
    batch: ["MB", "PZ"],
    materials: [
      {
        key: "abs",
        sku: "MNN-ABS-RSN",
        name: "Biji plastik ABS",
        uom: "KG",
        hs: "39033060",
        source: "import",
        receive: 20000,
        use: [8000, 0],
      },
      {
        key: "pewarna",
        sku: "MNN-MB-WRN",
        name: "Masterbatch pewarna",
        uom: "KG",
        hs: "32064990",
        source: "import",
        receive: 800,
        use: [300, 100],
      },
      {
        key: "gambar",
        sku: "MNN-CTK-PZL",
        name: "Lembar cetak gambar puzzle",
        uom: "PCS",
        hs: "49119990",
        source: "local",
        receive: 30000,
        use: [0, 24000],
      },
      {
        key: "stiker",
        sku: "MNN-STK-DEK",
        name: "Stiker dekorasi",
        uom: "PCS",
        hs: "39191099",
        source: "local",
        receive: 50000,
        use: [20000, 0],
      },
    ],
    packaging: {
      sku: "MNN-KTK-MNN",
      name: "Kotak kemasan mainan",
      hs: "48191000",
      receive: 30000,
      move: 24000,
      exportUse: 20000,
      inTransit: 3000,
    },
    finished: [
      {
        sku: "MNN-MBL-PLS",
        name: "Mobil-mobilan plastik",
        uom: "PCS",
        hs: "95030099",
        produce: 20000,
        export: 16000,
        reject: 200,
      },
      {
        sku: "MNN-PZL-48",
        name: "Puzzle anak 48 keping",
        uom: "PCS",
        hs: "95030070",
        produce: 12000,
        export: 8000,
        local: 3000,
        returned: 50,
        localPending: 800,
      },
    ],
    scrap: {
      sku: "MNN-SCR-PLS",
      name: "Sisa runner dan reject plastik",
      hs: "39159090",
      produce: 600,
      sold: 450,
    },
    defect: { material: "abs", qty: 500, reason: "Kadar air resin di atas standar" },
    damage: { material: "stiker", qty: 1000, reason: "Stiker lengket karena kelembapan" },
    pendingImport: { material: "abs", qty: 15000 },
    pendingLocal: { material: "stiker", qty: 30000 },
    returnReason: "Kepingan puzzle kurang",
    rejectReason: "Cacat cetak (short shot)",
    partners: {
      importVendor: ["Ningbo Demo Polymer Co.", "Ningbo, Zhejiang", "CN"],
      localVendor: ["PT Cetak Warna Demo", "Jl. Industri Raya 2, Tangerang", "ID"],
      packagingVendor: ["PT Box Mainan Demo", "Balaraja, Tangerang", "ID"],
      exportBuyer: ["Happy Play Toys LLC (demo)", "Dallas, TX", "US"],
      exportBuyer2: ["Kodomo Toys Co. (demo)", "Nagoya", "JP"],
      localBuyer: ["PT Toko Mainan Ceria Demo", "Jl. Pasar Baru 21, Jakarta", "ID"],
      collector: ["CV Giling Plastik Demo", "Jl. Cikupa Mas 4, Tangerang", "ID"],
    },
  },
  {
    key: "tas",
    prefix: "TAS",
    title: "Tas dan koper",
    location: "Bogor, Jawa Barat",
    story: "Kain nylon dan komponen impor dijahit menjadi ransel laptop dan koper kabin.",
    batch: ["RS", "KP"],
    materials: [
      {
        key: "nylon",
        sku: "TAS-NYL-600",
        name: "Kain nylon 600D",
        uom: "M",
        hs: "54076190",
        source: "import",
        receive: 6000,
        use: [3000, 1500],
      },
      {
        key: "resleting",
        sku: "TAS-RSL-NYL",
        name: "Resleting nylon #8",
        uom: "PCS",
        hs: "96071100",
        source: "import",
        receive: 15000,
        use: [6000, 4000],
      },
      {
        key: "roda",
        sku: "TAS-RODA-SET",
        name: "Roda koper dan trolley (set)",
        uom: "PCS",
        hs: "39269099",
        source: "import",
        receive: 2500,
        use: [0, 2000],
      },
      {
        key: "busa",
        sku: "TAS-BUSA-EVA",
        name: "Lembar busa EVA",
        uom: "PCS",
        hs: "39211999",
        source: "local",
        receive: 5000,
        use: [2000, 1500],
      },
      {
        key: "label",
        sku: "TAS-LBL-WVN",
        name: "Label merek tenun",
        uom: "PCS",
        hs: "58071000",
        source: "local",
        receive: 10000,
        use: [3000, 2000],
      },
    ],
    packaging: {
      sku: "TAS-KTN-MST",
      name: "Karton master tas",
      hs: "48191000",
      receive: 1200,
      move: 900,
      exportUse: 700,
      inTransit: 150,
    },
    finished: [
      {
        sku: "TAS-RSL-LPT",
        name: "Ransel laptop",
        uom: "PCS",
        hs: "42029290",
        produce: 3000,
        export: 2500,
        reject: 40,
      },
      {
        sku: "TAS-KPR-20",
        name: "Koper kabin 20 inci",
        uom: "PCS",
        hs: "42021299",
        produce: 2000,
        export: 1300,
        local: 500,
        returned: 15,
        localPending: 150,
      },
    ],
    scrap: {
      sku: "TAS-SCR-NYL",
      name: "Sisa potongan kain nylon",
      hs: "63109010",
      produce: 180,
      sold: 130,
    },
    defect: { material: "nylon", qty: 250, reason: "Coating kain tidak merata" },
    damage: { material: "busa", qty: 60, reason: "Busa penyok tertindih palet" },
    pendingImport: { material: "nylon", qty: 4000 },
    pendingLocal: { material: "label", qty: 8000 },
    returnReason: "Roda koper macet",
    rejectReason: "Jahitan tali bahu lepas",
    partners: {
      importVendor: ["Quanzhou Demo Bag Material Co.", "Quanzhou, Fujian", "CN"],
      localVendor: ["PT Busa Industri Demo", "Jl. Raya Bogor KM 30, Bogor", "ID"],
      packagingVendor: ["PT Karton Sukabumi Demo", "Cicurug, Sukabumi", "ID"],
      exportBuyer: ["Urban Carry Inc. (demo)", "Seattle, WA", "US"],
      exportBuyer2: ["Voyage Bagage BV (demo)", "Rotterdam", "NL"],
      localBuyer: ["PT Gerai Tas Nusantara Demo", "Jl. Raya Bogor 120, Depok", "ID"],
      collector: ["CV Daur Tekstil Bogor Demo", "Jl. Industri 9, Bogor", "ID"],
    },
  },
  {
    key: "bulumata",
    prefix: "BLM",
    title: "Bulu mata dan rambut palsu",
    location: "Purbalingga, Jawa Tengah",
    story: "Rambut olahan dan serat sintetis impor dirangkai menjadi bulu mata palsu dan wig.",
    batch: ["BM", "WG"],
    materials: [
      {
        key: "rambut",
        sku: "BLM-RMB-OLH",
        name: "Rambut manusia olahan",
        uom: "KG",
        hs: "05010000",
        source: "import",
        receive: 400,
        use: [120, 200],
      },
      {
        key: "serat",
        sku: "BLM-SRT-SNT",
        name: "Serat sintetis wig",
        uom: "KG",
        hs: "55031100",
        source: "import",
        receive: 300,
        use: [0, 150],
      },
      {
        key: "lem",
        sku: "BLM-LEM-BLM",
        name: "Lem bulu mata",
        uom: "KG",
        hs: "35069900",
        source: "local",
        receive: 80,
        use: [30, 10],
      },
      {
        key: "benang",
        sku: "BLM-BNG-WIG",
        name: "Benang jahit wig (cone)",
        uom: "PCS",
        hs: "54011090",
        source: "local",
        receive: 500,
        use: [100, 200],
      },
    ],
    packaging: {
      sku: "BLM-TRY-BLM",
      name: "Kotak dan tray bulu mata",
      hs: "48191000",
      receive: 60000,
      move: 50000,
      exportUse: 45000,
      inTransit: 5000,
    },
    finished: [
      {
        sku: "BLM-BLM-PSG",
        name: "Bulu mata palsu (pasang)",
        uom: "PCS",
        hs: "67049000",
        produce: 50000,
        export: 42000,
        reject: 600,
      },
      {
        sku: "BLM-WIG-SNT",
        name: "Wig sintetis",
        uom: "PCS",
        hs: "67041100",
        produce: 3000,
        export: 2000,
        local: 600,
        returned: 10,
        localPending: 300,
      },
    ],
    scrap: {
      sku: "BLM-SCR-RMB",
      name: "Sisa potongan rambut",
      hs: "05010000",
      produce: 40,
      sold: 25,
    },
    defect: { material: "rambut", qty: 20, reason: "Panjang rambut di bawah spesifikasi" },
    damage: { material: "serat", qty: 5, reason: "Serat kusut terkena panas" },
    pendingImport: { material: "rambut", qty: 300 },
    pendingLocal: { material: "lem", qty: 40 },
    returnReason: "Warna wig berbeda dari katalog",
    rejectReason: "Bulu mata tidak simetris",
    partners: {
      importVendor: ["Xuchang Demo Hair Products Co.", "Xuchang, Henan", "CN"],
      localVendor: ["PT Kimia Kosmetik Demo", "Jl. Jend. Sudirman 50, Purwokerto", "ID"],
      packagingVendor: ["PT Kemasan Purbalingga Demo", "Jl. Raya Bobotsari 12, Purbalingga", "ID"],
      exportBuyer: ["Glam Lash Inc. (demo)", "Los Angeles, CA", "US"],
      exportBuyer2: ["Seoul Beauty Co. (demo)", "Seoul", "KR"],
      localBuyer: ["PT Salon Kecantikan Demo", "Jl. Kemang Raya 15, Jakarta", "ID"],
      collector: ["CV Pengepul Rambut Demo", "Jl. Mayjen Sungkono 3, Purbalingga", "ID"],
    },
  },
  {
    key: "sarungtangan",
    prefix: "SGK",
    title: "Sarung tangan karet",
    location: "Deli Serdang, Sumatera Utara",
    story: "Lateks lokal dan bahan kimia impor dicelup menjadi sarung tangan medis dan industri.",
    batch: ["MD", "IN"],
    materials: [
      {
        key: "karet",
        sku: "SGK-SBR-SNT",
        name: "Karet sintetis SBR",
        uom: "KG",
        hs: "40021990",
        source: "import",
        receive: 15000,
        use: [6000, 4000],
      },
      {
        key: "akselerator",
        sku: "SGK-AKS-VLK",
        name: "Akselerator vulkanisasi",
        uom: "KG",
        hs: "38121000",
        source: "import",
        receive: 1200,
        use: [500, 400],
      },
      {
        key: "zinc",
        sku: "SGK-ZNO",
        name: "Zinc oxide",
        uom: "KG",
        hs: "28170010",
        source: "import",
        receive: 800,
        use: [300, 250],
      },
      {
        key: "lateks",
        sku: "SGK-LTK-PKT",
        name: "Lateks pekat (centrifuged)",
        uom: "KG",
        hs: "40011011",
        source: "local",
        receive: 60000,
        use: [25000, 20000],
      },
    ],
    packaging: {
      sku: "SGK-KTN-DSP",
      name: "Karton dispenser 100 pcs",
      hs: "48191000",
      receive: 50000,
      move: 40000,
      exportUse: 35000,
      inTransit: 4000,
    },
    finished: [
      {
        sku: "SGK-MED-BOX",
        name: "Sarung tangan medis lateks (box)",
        uom: "PCS",
        hs: "40151290",
        produce: 30000,
        export: 25000,
        reject: 400,
      },
      {
        sku: "SGK-IND-BOX",
        name: "Sarung tangan industri (box)",
        uom: "PCS",
        hs: "40151990",
        produce: 20000,
        export: 14000,
        local: 4000,
        returned: 80,
        localPending: 1500,
      },
    ],
    scrap: {
      sku: "SGK-SCR-KRT",
      name: "Sarung tangan reject dan sisa karet",
      hs: "40040000",
      produce: 2500,
      sold: 1800,
    },
    defect: { material: "akselerator", qty: 50, reason: "Kedaluwarsa sebelum diterima" },
    damage: { material: "lateks", qty: 300, reason: "Lateks menggumpal di tangki" },
    pendingImport: { material: "karet", qty: 10000 },
    pendingLocal: { material: "lateks", qty: 40000 },
    returnReason: "Ukuran box tertukar (M dikirim L)",
    rejectReason: "Pinhole saat uji kebocoran air",
    partners: {
      importVendor: ["Demo Chemical Industries Sdn. Bhd.", "Klang, Selangor", "MY"],
      localVendor: ["PT Perkebunan Lateks Demo", "Jl. Medan-Binjai KM 14, Deli Serdang", "ID"],
      packagingVendor: ["PT Karton Sumatera Demo", "KIM II, Medan", "ID"],
      exportBuyer: ["MediSafe Supplies Inc. (demo)", "Chicago, IL", "US"],
      exportBuyer2: ["CleanGuard GmbH (demo)", "Hamburg", "DE"],
      localBuyer: ["PT Alat Kesehatan Nusantara Demo", "Jl. Gatot Subroto 77, Medan", "ID"],
      collector: ["CV Daur Karet Demo", "Jl. Pelabuhan 2, Belawan", "ID"],
    },
  },
  {
    key: "wireharness",
    prefix: "WRH",
    title: "Wire harness otomotif",
    location: "Karawang, Jawa Barat",
    story: "Terminal dan konektor impor dirakit dengan kabel lokal menjadi wire harness mobil.",
    batch: ["EN", "BD"],
    materials: [
      {
        key: "terminal",
        sku: "WRH-TRM-KNG",
        name: "Terminal kuningan",
        uom: "PCS",
        hs: "85369019",
        source: "import",
        receive: 400000,
        use: [160000, 120000],
      },
      {
        key: "konektor",
        sku: "WRH-HSG-KON",
        name: "Housing konektor",
        uom: "PCS",
        hs: "85366999",
        source: "import",
        receive: 80000,
        use: [30000, 25000],
      },
      {
        key: "grommet",
        sku: "WRH-GRM-KRT",
        name: "Grommet karet",
        uom: "PCS",
        hs: "40169999",
        source: "import",
        receive: 15000,
        use: [5000, 6000],
      },
      {
        key: "kabel",
        sku: "WRH-KBL-AVS",
        name: "Kabel otomotif AVSS",
        uom: "M",
        hs: "85444294",
        source: "local",
        receive: 200000,
        use: [80000, 60000],
      },
      {
        key: "tape",
        sku: "WRH-TAPE-PVC",
        name: "Tape PVC harness",
        uom: "PCS",
        hs: "39191099",
        source: "local",
        receive: 20000,
        use: [8000, 6000],
      },
    ],
    packaging: {
      sku: "WRH-KTN-RTN",
      name: "Karton returnable harness",
      hs: "48191000",
      receive: 6000,
      move: 4500,
      exportUse: 3500,
      inTransit: 600,
    },
    finished: [
      {
        sku: "WRH-WH-ENG",
        name: "Wire harness engine",
        uom: "PCS",
        hs: "85443012",
        produce: 5000,
        export: 4200,
        reject: 50,
      },
      {
        sku: "WRH-WH-BDY",
        name: "Wire harness body",
        uom: "PCS",
        hs: "85443013",
        produce: 6000,
        export: 3500,
        local: 2000,
        returned: 25,
        localPending: 400,
      },
    ],
    scrap: {
      sku: "WRH-SCR-CU",
      name: "Sisa potongan kabel tembaga",
      hs: "74040000",
      produce: 900,
      sold: 700,
    },
    defect: { material: "konektor", qty: 2000, reason: "Dimensi housing di luar toleransi" },
    damage: { material: "tape", qty: 300, reason: "Tape kehilangan daya rekat" },
    pendingImport: { material: "terminal", qty: 300000 },
    pendingLocal: { material: "kabel", qty: 150000 },
    returnReason: "Terminal tidak terkunci sempurna",
    rejectReason: "Gagal uji kontinuitas",
    partners: {
      importVendor: ["Demo Connector Japan Co., Ltd.", "Yokkaichi, Mie", "JP"],
      localVendor: ["PT Kabel Otomotif Demo", "Kawasan Industri KIIC, Karawang", "ID"],
      packagingVendor: ["PT Kemasan Karawang Demo", "Jl. Interchange Tol 3, Karawang", "ID"],
      exportBuyer: ["Demo Motor Manufacturing Thailand Co.", "Rayong", "TH"],
      exportBuyer2: ["Demo Auto Parts Vietnam Co.", "Hai Phong", "VN"],
      localBuyer: ["PT Perakitan Mobil Demo", "Kawasan Industri Suryacipta, Karawang", "ID"],
      collector: ["CV Daur Tembaga Demo", "Jl. Raya Klari 10, Karawang", "ID"],
    },
  },
  {
    key: "kemasan",
    prefix: "KMS",
    title: "Kemasan plastik fleksibel",
    location: "Cikarang, Bekasi",
    story: "Biji plastik, tinta, dan foil impor dicetak dan dilaminasi menjadi pouch dan film.",
    batch: ["SP", "FL"],
    materials: [
      {
        key: "pe",
        sku: "KMS-LLDPE",
        name: "Biji plastik LLDPE",
        uom: "KG",
        hs: "39011092",
        source: "import",
        receive: 40000,
        use: [15000, 18000],
      },
      {
        key: "tinta",
        sku: "KMS-TNT-RTG",
        name: "Tinta cetak rotogravure",
        uom: "KG",
        hs: "32151990",
        source: "import",
        receive: 3000,
        use: [1200, 800],
      },
      {
        key: "foil",
        sku: "KMS-FOIL-7",
        name: "Aluminium foil 7 mikron",
        uom: "KG",
        hs: "76071900",
        source: "import",
        receive: 5000,
        use: [2000, 0],
      },
      {
        key: "lem",
        sku: "KMS-LEM-LAM",
        name: "Lem laminasi",
        uom: "KG",
        hs: "35069900",
        source: "local",
        receive: 4000,
        use: [1500, 1000],
      },
      {
        key: "core",
        sku: "KMS-CORE-KTN",
        name: "Core karton gulungan",
        uom: "PCS",
        hs: "48229090",
        source: "local",
        receive: 3000,
        use: [0, 1500],
      },
    ],
    packaging: {
      sku: "KMS-KTN-PLT",
      name: "Karton dan pallet pengiriman",
      hs: "48191000",
      receive: 4000,
      move: 3000,
      exportUse: 2500,
      inTransit: 400,
    },
    finished: [
      {
        sku: "KMS-PCH-LAM",
        name: "Standing pouch laminasi",
        uom: "PCS",
        hs: "39232990",
        produce: 900000,
        export: 750000,
        reject: 10000,
      },
      {
        sku: "KMS-FLM-PE",
        name: "Film PE gulungan",
        uom: "KG",
        hs: "39201090",
        produce: 16000,
        export: 10000,
        local: 4500,
        returned: 100,
        localPending: 1200,
      },
    ],
    scrap: {
      sku: "KMS-SCR-PE",
      name: "Sisa film dan trim PE",
      hs: "39151090",
      produce: 2200,
      sold: 1800,
    },
    defect: { material: "tinta", qty: 100, reason: "Viskositas tinta tidak sesuai" },
    damage: { material: "foil", qty: 50, reason: "Foil penyok saat bongkar muat" },
    pendingImport: { material: "pe", qty: 30000 },
    pendingLocal: { material: "lem", qty: 2000 },
    returnReason: "Ketebalan film tidak sesuai spesifikasi",
    rejectReason: "Delaminasi saat uji seal",
    partners: {
      importVendor: ["Demo Petrochemical Pte. Ltd.", "Jurong Island", "SG"],
      localVendor: ["PT Perekat Kemasan Demo", "Kawasan Industri Jababeka, Cikarang", "ID"],
      packagingVendor: ["PT Pallet Cikarang Demo", "Jl. Industri Selatan 6, Cikarang", "ID"],
      exportBuyer: ["Pacific Snack Foods Pty. Ltd. (demo)", "Sydney", "AU"],
      exportBuyer2: ["Demo Foods Philippines Inc.", "Manila", "PH"],
      localBuyer: ["PT Makanan Ringan Nusantara Demo", "Jl. Raya Narogong 30, Bekasi", "ID"],
      collector: ["CV Daur Plastik Cikarang Demo", "Jl. Raya Cikarang-Cibarusah 8, Bekasi", "ID"],
    },
  },
] as const satisfies readonly DemoScenario[]

export type DemoScenarioKey = (typeof DEMO_SCENARIOS)[number]["key"]
export const DEMO_SCENARIO_KEYS = DEMO_SCENARIOS.map((scenario) => scenario.key) as [
  DemoScenarioKey,
  ...DemoScenarioKey[],
]

export function demoScenario(key: DemoScenarioKey): DemoScenario {
  return DEMO_SCENARIOS.find((scenario) => scenario.key === key)!
}

// Qty satu putaran harus cocok dengan alur 45 hari (bahan tidak dipakai melebihi yang diterima,
// barang jadi tidak keluar melebihi yang diproduksi). Kosong = skenario valid.
export function demoScenarioProblems(scenario: DemoScenario): string[] {
  const problems: string[] = []
  const material = (key: string) => scenario.materials.find((entry) => entry.key === key)
  for (const entry of scenario.materials) {
    const defect = scenario.defect.material === entry.key ? scenario.defect.qty : 0
    const damage = scenario.damage.material === entry.key ? scenario.damage.qty : 0
    if (entry.use[0] + entry.use[1] + defect + damage > entry.receive) {
      problems.push(`${entry.sku}: pemakaian, retur, dan rusak melebihi qty diterima.`)
    }
  }
  for (const ref of [
    scenario.defect,
    scenario.damage,
    scenario.pendingImport,
    scenario.pendingLocal,
  ]) {
    if (!material(ref.material)) problems.push(`Bahan ${ref.material} tidak ada di daftar bahan.`)
  }
  if (material(scenario.defect.material)?.source !== "import") {
    problems.push("Bahan cacat yang diretur harus bahan impor.")
  }
  if (material(scenario.pendingImport.material)?.source !== "import") {
    problems.push("Kontainer berikutnya harus bahan impor.")
  }
  if (material(scenario.pendingLocal.material)?.source !== "local") {
    problems.push("Order berikutnya harus bahan lokal.")
  }
  const { packaging } = scenario
  if (
    packaging.move + packaging.inTransit > packaging.receive ||
    packaging.exportUse > packaging.move
  ) {
    problems.push(`${packaging.sku}: qty kemasan tidak cukup.`)
  }
  const [a, b] = scenario.finished
  if (a.export + a.reject > a.produce) problems.push(`${a.sku}: keluar melebihi produksi.`)
  if (b.returned > b.local) problems.push(`${b.sku}: retur melebihi jual lokal.`)
  if (b.export + b.local > b.produce) problems.push(`${b.sku}: keluar melebihi produksi.`)
  if (b.localPending > b.produce - b.export - b.local + b.returned) {
    problems.push(`${b.sku}: jual lokal berikutnya melebihi sisa stok.`)
  }
  if (scenario.scrap.sold > scenario.scrap.produce) {
    problems.push(`${scenario.scrap.sku}: terjual melebihi sisa produksi.`)
  }
  for (const hs of [
    ...scenario.materials.map((entry) => entry.hs),
    packaging.hs,
    a.hs,
    b.hs,
    scenario.scrap.hs,
  ]) {
    if (!/^\d{8}$/.test(hs)) problems.push(`Kode HS ${hs} harus 8 digit.`)
  }
  return problems
}
