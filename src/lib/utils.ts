import { createCn } from "cn/config"

// cn dengan ukuran teks kustom dari globals.css (text-control, text-caption). Tanpa ini keduanya
// dianggap kelas warna dan terbuang saat digabung dengan text-<warna> (mis. di tombol dan menu).
export const cn = createCn({
  extend: { classGroups: { "font-size": [{ text: ["control", "caption"] }] } },
})
