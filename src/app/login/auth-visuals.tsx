// Ilustrasi panel brand halaman masuk. SVG sebaris (bukan berkas gambar) supaya warnanya ikut
// token sidebar dan tetap terbaca di tema terang maupun gelap, serta tidak menambah permintaan
// jaringan di halaman yang belum punya sesi.
export function AuthVisualLogin() {
  return (
    <svg
      viewBox="0 0 420 280"
      fill="none"
      aria-hidden="true"
      className="auth-visual"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Garis dasar kawasan. */}
      <path
        d="M18 236h384"
        stroke="var(--sidebar-foreground)"
        strokeOpacity="0.28"
        strokeWidth="1.7"
        strokeLinecap="round"
      />

      {/* Dokumen pemasukan. */}
      <rect
        x="18"
        y="96"
        width="72"
        height="92"
        rx="8"
        fill="var(--sidebar-accent)"
        fillOpacity="0.45"
        stroke="var(--sidebar-primary)"
        strokeOpacity="0.8"
        strokeWidth="1.7"
      />
      <path
        d="M33 118h42M33 134h42M33 150h30"
        stroke="var(--sidebar-primary)"
        strokeOpacity="0.7"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle
        cx="76"
        cy="168"
        r="9"
        fill="var(--sidebar-primary)"
        fillOpacity="0.18"
        stroke="var(--sidebar-primary)"
        strokeOpacity="0.8"
        strokeWidth="1.7"
      />
      <path
        d="m72 168 3 3 5-5"
        stroke="var(--sidebar-primary)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Alur masuk. */}
      <path
        className="auth-flow"
        d="M98 142h44"
        stroke="var(--sidebar-primary)"
        strokeOpacity="0.7"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeDasharray="5 6"
      />
      <path
        d="m138 138 5 4-5 4"
        stroke="var(--sidebar-primary)"
        strokeOpacity="0.8"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Gudang kawasan berikat. */}
      <path
        d="M160 236v-84l70-46 70 46v84"
        fill="var(--sidebar-accent)"
        fillOpacity="0.5"
        stroke="var(--sidebar-primary)"
        strokeOpacity="0.8"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M160 152l70-46 70 46"
        stroke="var(--sidebar-primary)"
        strokeOpacity="0.85"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* Barang yang ditimbun. */}
      <rect
        x="176"
        y="184"
        width="108"
        height="17"
        rx="3"
        stroke="var(--sidebar-primary)"
        strokeOpacity="0.7"
        strokeWidth="1.6"
      />
      <rect
        x="176"
        y="205"
        width="108"
        height="17"
        rx="3"
        stroke="var(--sidebar-primary)"
        strokeOpacity="0.7"
        strokeWidth="1.6"
      />
      <path
        d="M203 184v17M230 184v17M257 184v17M203 205v17M230 205v17M257 205v17"
        stroke="var(--sidebar-primary)"
        strokeOpacity="0.6"
        strokeWidth="1.2"
      />

      {/* Alur keluar. */}
      <path
        className="auth-flow"
        d="M300 196h28"
        stroke="var(--sidebar-primary)"
        strokeOpacity="0.7"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeDasharray="5 6"
      />
      <path
        d="m324 192 5 4-5 4"
        stroke="var(--sidebar-primary)"
        strokeOpacity="0.8"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Barang keluar. */}
      <path
        d="M340 172h52v52h-52z"
        fill="var(--sidebar-accent)"
        fillOpacity="0.4"
        stroke="var(--sidebar-primary)"
        strokeOpacity="0.8"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M340 190h52M357 172v18"
        stroke="var(--sidebar-primary)"
        strokeOpacity="0.7"
        strokeWidth="1.6"
        strokeLinecap="round"
      />

      {/* Penanda lokasi. */}
      <circle cx="230" cy="236" r="3" fill="var(--sidebar-primary)" fillOpacity="0.8" />
    </svg>
  )
}

export function AuthVisualMfa() {
  return (
    <svg
      viewBox="0 0 420 280"
      fill="none"
      aria-hidden="true"
      className="auth-visual"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Perisai. */}
      <path
        d="M210 44l86 34v72c0 46-38 74-86 88-48-14-86-42-86-88V78z"
        fill="var(--sidebar-accent)"
        fillOpacity="0.45"
        stroke="var(--sidebar-primary)"
        strokeOpacity="0.8"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M210 44l86 34v72c0 46-38 74-86 88-48-14-86-42-86-88V78z"
        stroke="var(--sidebar-primary)"
        strokeOpacity="0.2"
        strokeWidth="10"
        strokeLinejoin="round"
      />

      {/* Enam digit kode. */}
      {[0, 1, 2].map((column) =>
        [0, 1].map((row) => (
          <circle
            key={`${column}-${row}`}
            cx={168 + column * 42}
            cy={142 + row * 40}
            r="10"
            fill="var(--sidebar-primary)"
            fillOpacity={row === 0 ? "0.85" : "0.4"}
          />
        )),
      )}
    </svg>
  )
}
