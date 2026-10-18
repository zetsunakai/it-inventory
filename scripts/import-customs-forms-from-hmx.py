#!/usr/bin/env python3
"""Bangkitkan isi form dokumen BC dari form hmx-002 core_it_inventory.

Membaca views/document_XX_views.xml (tab, grup, field, label), views/document_product_views.xml
(form Barang per jenis), models/*.py (jenis field, label, pilihan), dan data/*.xml (daftar kode),
lalu menulis src/modules/it-inventory/lib/customs-layouts.generated.ts. Label diambil apa adanya
dari hmx (keputusan user 18/10/2026: form dokumen BC sama persis dengan hmx).

Pemakaian (dari root repo):
  python3 -I scripts/import-customs-forms-from-hmx.py ~/hmx/hmx-002/hmx/module/basic/core_it_inventory
  npx prettier --write src/modules/it-inventory/lib/customs-layouts.generated.ts

Field hmx dipetakan ke penyimpanan repo ini (kolom header, details jsonb, entitas, sarana angkut,
kolom atau details baris barang) lewat tabel di bawah. Field yang belum dikenal disimpan di details
dengan kunci camelCase dari nama field hmx.
"""

import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

DOC_CODES = ["23", "40", "25", "30", "41", "20", "261", "262", "27", "16", "28", "33", "331"]
DIRECTION_IN = {"23", "40", "20", "262", "16"}
OUTPUT = Path("src/modules/it-inventory/lib/customs-layouts.generated.ts")

# Field kantor hmx yang menjadi kantor pabean dokumen (customs_office_code, dipakai nomor aju).
OFFICE_FIELD = {
    "23": "supervisory_office",
    "40": "customs_office",
    "25": "customs_office",
    "30": "loading_customs_office",
    "41": "customs_office",
    "20": "customs_office",
    "261": "customs_office",
    "262": "customs_office",
    "27": "origin_customs_office",
    "16": "supervisory_office",
    "28": "loading_customs_office",
    "33": "loading_customs_office",
    "331": "loading_customs_office",
}

HEADER_COLUMNS = {
    "currency": ("currencyCode", {"kind": "ref", "refType": "currency"}),
    "exchange_rate": ("ndpbm", {"kind": "qty"}),
    "cif_value": ("cifValue", {"kind": "money"}),
    "export_value": ("fobValue", {"kind": "money"}),
    "fob_value": ("fobValue", {"kind": "money"}),
    "freight": ("freightValue", {"kind": "money"}),
    "insurance_value": ("insuranceValue", {"kind": "money"}),
    "incoterm_value": ("deliveryPrice", {"kind": "money"}),
    "gross_weight": ("grossWeight", {"kind": "qty"}),
    "net_weight": ("netWeight", {"kind": "qty"}),
    "statement_place": ("signerCity", {"kind": "text"}),
    "statement_date": ("signedDate", {"kind": "date"}),
    "statement_name": ("signerName", {"kind": "text"}),
    "statement_position": ("signerPosition", {"kind": "text"}),
}

# Kunci details yang sudah dipakai data dan aturan validasi sebelum layout dibangkitkan.
DETAIL_KEYS = {
    "unloading_office": "unloadingOfficeCode",
    "supervisory_office": "supervisoryOfficeCode",
    "loading_customs_office": "loadingOfficeCode",
    "destination_customs_office": "destinationOfficeCode",
    "tpb_type": "tpbTypeCode",
    "destination_tpb_type": "destinationTpbTypeCode",
    "plb_warehouse_code": "plbWarehouseCode",
    "destination_plb_warehouse_code": "destinationPlbWarehouseCode",
    "payment_term": "paymentTermCode",
    "loading_port": "loadingPortCode",
    "loading_origin_port": "loadingPortCode",
    "unloading_port": "unloadingPortCode",
    "transit_port": "transitPortCode",
    "destination_port": "destinationPortCode",
    "loading_export_port": "loadingExportPortCode",
    "storehouse_location": "tpsCode",
    "no_bc11": "bc11Number",
    "bc11_date": "bc11Date",
    "bc11_pos": "bc11Pos",
    "bc11_subpos": "bc11Subpos",
    "bc11_subsubpos": "bc11Subsubpos",
    "close_pu_number": "closePuNumber",
    "estimated_arrival_date": "estimatedArrivalDate",
    "estimated_export_date": "estimatedExportDate",
    "incoterm": "incotermCode",
    "insurance_type": "insuranceTypeCode",
    "customs_value": "customsValue",
    "additional_cost": "additionalCost",
    "deduction_cost": "deductionCost",
    "service_value": "serviceValue",
    "down_payment": "downPayment",
    "discount": "discountValue",
    "dpp_value": "dppValue",
    "volume": "volume",
    "tarif_ppn_tax": "ppnRate",
    "ppn_tax": "ppnValue",
    "tarif_ppnbm_tax": "ppnbmRate",
    "ppnbm_tax": "ppnbmValue",
    "procedure_type": "procedureTypeCode",
    "import_type": "importTypeCode",
    "trade_transaction_type": "tradeTransactionTypeCode",
    "export_type": "exportTypeCode",
    "export_category": "exportCategoryCode",
    "trade_refference": "tradeMethodCode",
    "bulk_type": "bulkTypeCode",
    "vd_type": "valuationTypeCode",
    "ckd_ikd_blending": "ckdIkdBlending",
    "maklon_value": "maklonValue",
    "income_tax_value": "exportIncomeTaxValue",
    "goods_value": "goodsValue",
    "loading_date": "loadingDate",
    "entry_date": "plbEntryDate",
    "destination_country": "destinationCountryCode",
    "container_date": "stuffingDate",
    "container_place": "stuffingPlace",
    "estimated_loading_date": "estimatedLoadingDate",
    "call_sign": "callSign",
    "safety_sign_quantity": "sealQty",
    "safety_sign_type": "sealTypeCode",
    "voluntary_declaration_value": "voluntaryDeclarationValue",
    "acquisition_price": "acquisitionPrice",
}

# Peran entitas dari awalan nama field hmx: kode entitas CEISA (23 = konsolidator, seperti Equip3).
PARTY_PREFIXES = {
    "entrepreneur": "3",
    "owner": "7",
    "supplier": "5",
    "sender": "9",
    "recipient": "8",
    "importer": "1",
    "exporter": "2",
    "buyer": "6",
    "seller": "10",
    "central": "11",
    "ppjk": "4",
    "consolidator": "23",
}
# Peran yang diisi dari profil perusahaan; sisanya dipilih dari master partner.
COMPANY_ROLES = {"3", "2", "11"}
COMPANY_ROLES_PER_DOC = {"20": {"1", "7"}, "28": set(), "16": {"7"}}
DEFAULT_COMPANY_EXTRA = {"7"}

PARTY_ATTRS = {
    "identity_type": ("identityTypeCode", "party"),
    "identity_number": ("identityNumber", "party"),
    "names": ("name", "party"),
    "address": ("address", "party"),
    "country": ("countryCode", "party"),
    "permit_number": ("permitNumber", "party"),
    "permit_date": ("permitDate", "party"),
    "nib": ("nib", "party"),
    "nitku": ("nitku", "partyDetails"),
    "status": ("businessStatusCode", "partyDetails"),
    "code_api": ("apiTypeCode", "partyDetails"),
    "compliance_status": ("complianceStatus", "partyDetails"),
}

TRANSPORT_ATTRS = {
    "transport_method": "transportModeCode",
    "transport_name": "name",
    "transport_number": "voyageNumber",
    "transport_country": "flagCountryCode",
}

LINE_COLUMNS = {
    "hs_code": "hsCode",
    "product_code": "itemCode",
    "description": "description",
    "brand": "brand",
    "product_type": "itemType",
    "product_size": "itemSize",
    "specifications": "specification",
    "quantity": "qty",
    "unit": "ceisaUnitCode",
    "package_quantity": "packageQty",
    "package_type": "packageTypeCode",
    "net_weight": "netWeight",
    "origin_country": "originCountryCode",
    "unit_price": "unitPrice",
    "fob_value": "fobValue",
    "cif_value": "cifValue",
    "incoterm_value": "deliveryPrice",
    "freight": "freightValue",
    "insurance": "insuranceValue",
    "invoice_price": "invoiceValue",
    "customs_value_idr": "customsValue",
}

# Model hmx yang sudah ada sebagai referensi kepabeanan repo ini.
REF_MODELS = {
    "it_inventory_beacukai_office": "customs_office",
    "basecountry": "country",
    "basecurrency": "currency",
    "it_inventory_incoterm": "incoterm",
    "it_inventory_package_type": "package_type",
    "it_inventory_storehouse_location": "tps",
    "it_inventory_container_type": "container_type",
    "it_inventory_document_type": "document_type",
    "it_inventory_tax_type": "levy_type",
    "it_inventory_product_unit": "ceisa_unit",
    "it_inventory_fee_code_hs": "hs_code",
    "it_inventory_facilities": "facility",
}

# Daftar (sub-tabel) per nama field one2many hmx.
LIST_KINDS = [
    (r"document(_\d+|_product)?_lines", "attachments"),
    (r"package(_\d+)?_lines", "packages"),
    (r"container(_\d+)?_lines", "containers"),
    (r"product(_\d+)?_lines", "lines"),
    (r"tax_lines", "taxes"),
    (r"guarantee_lines", "guarantees"),
    (r"transportation_\d+_lines", "transports"),
    (r"doc_\d+_bank_devisa", "bankAccounts"),
    (r"doc_\d+_entitas_lines", "owners"),
    (r"vd_lines", "vdEntries"),
]

LIST_COLUMNS = {
    "attachments": {
        "document_type": ("documentTypeCode", {"kind": "ref", "refType": "document_type"}),
        "number": ("number", {"kind": "text"}),
        "document_date": ("date", {"kind": "date"}),
        "facility": ("facilityCode", {"kind": "ref", "refType": "facility"}),
        "permit": ("permit", {"kind": "text"}),
        "office": ("officeCode", {"kind": "text"}),
        "file": ("file", {"kind": "file"}),
    },
    "packages": {
        "quantity": ("qty", {"kind": "qty"}),
        "package_type": ("packageTypeCode", {"kind": "ref", "refType": "package_type"}),
        "brand": ("marks", {"kind": "text"}),
    },
    "containers": {
        "number": ("number", {"kind": "text", "mono": True}),
        "size": ("sizeCode", {"kind": "ref", "refType": "container_size"}),
        "load_type": ("loadTypeCode", {"kind": "option", "list": "containerLoad"}),
        "container_type": ("typeCode", {"kind": "ref", "refType": "container_type"}),
    },
    "transports": {
        "transport_name": ("name", {"kind": "text"}),
        "transport_number": ("voyageNumber", {"kind": "text"}),
        "transport_method": ("transportModeCode", {"kind": "ref", "refType": "transport_mode"}),
        "transport_country": ("flagCountryCode", {"kind": "ref", "refType": "country"}),
    },
    "taxes": {
        "tax_type": ("levyTypeCode", {"kind": "ref", "refType": "levy_type"}),
        "rate": ("rate", {"kind": "qty"}),
        "value": ("amount", {"kind": "money"}),
        "status": ("status", {"kind": "option", "list": "taxStatus"}),
    },
    "guarantees": {
        "guarantee_type": ("typeCode", {"kind": "option", "list": "guaranteeType"}),
        "guarantee_no": ("number", {"kind": "text"}),
        "guarantee_date": ("date", {"kind": "date"}),
        "guarantee_value": ("value", {"kind": "money"}),
        "guarantee_limit_date": ("dueDate", {"kind": "date"}),
        "name": ("guarantor", {"kind": "text"}),
        "no_bpj": ("bpjNumber", {"kind": "text"}),
        "date_bpj": ("bpjDate", {"kind": "date"}),
    },
    "bankAccounts": {
        "code": ("code", {"kind": "text", "mono": True}),
        "name": ("bankCode", {"kind": "option", "list": "bankDevisa"}),
    },
    "owners": {
        "code": ("code", {"kind": "text"}),
        "identity_type": ("identityTypeCode", {"kind": "option", "list": "identityType"}),
        "identity_number": ("identityNumber", {"kind": "text", "mono": True}),
        "nitku": ("nitku", {"kind": "text", "mono": True}),
        "name": ("name", {"kind": "text"}),
        "address": ("address", {"kind": "text", "long": True}),
    },
    "vdEntries": {
        "vd_type": ("valuationTypeCode", {"kind": "option", "list": "valuationType"}),
        "expired_date": ("dueDate", {"kind": "date"}),
        "amount": ("amount", {"kind": "money"}),
    },
    "lines": {
        "hs_code": ("hsCode", {"kind": "ref", "refType": "hs_code"}),
        "product": ("product", {"kind": "product"}),
        "description": ("description", {"kind": "text"}),
        "fob_value": ("fobValue", {"kind": "money"}),
        "quantity": ("qty", {"kind": "qty"}),
        "unit": ("ceisaUnitCode", {"kind": "ref", "refType": "ceisa_unit"}),
    },
}
LIST_MODELS = {
    "attachments": "document_attachment",
    "packages": "document_package",
    "containers": "document_container",
    "transports": "document_transportation",
    "taxes": "document_tax",
    "guarantees": "document_guarantee",
    "bankAccounts": "document_bank_devisa",
    "owners": "document_entitas_line",
    "vdEntries": "document_vd_line",
    "lines": "document_product",
}

# Daftar kode dari data hmx untuk model yang belum ada di referensi kepabeanan repo ini.
DATA_LISTS = {
    "it_inventory_tpb_type": "tpbType",
    "it_inventory_payment_term": "paymentTerm",
    "it_inventory_procedure_type": "procedureType",
    "it_inventory_trade_transaction_type": "tradeTransactionType",
    "it_inventory_vd_type": "valuationType",
    "it_inventory_export_category": "exportCategory",
    "it_inventory_trade_refference": "tradeMethod",
    "it_inventory_business_status": "businessStatus",
    "it_inventory_export_purpose": "exportPurpose",
    "it_inventory_import_purpose": "importPurpose",
    "it_inventory_guarantee_type": "guaranteeType",
    "it_inventory_bank_devisa": "bankDevisa",
    "it_inventory_facilities_fee": "facilitiesFee",
    "it_inventory_product_category": "productCategory",
    "it_inventory_product_condition": "productCondition",
    "it_inventory_country_city": "countryCity",
    "it_inventory_reason_export": "reasonExport",
}

# Label hmx yang jelas salah salin; dipakai label yang dimaksud.
LABEL_FIXES = {
    ("261", "guarantees"): "Jaminan",
    ("262", "guarantees"): "Jaminan",
}
TAB_FIXES = {"Document": "Dokumen"}


def camel(name):
    head, *rest = name.split("_")
    return head + "".join(part.capitalize() for part in rest)


def parse_model(path):
    """Field model hmx: nama → jenis, label, target FK, nama pilihan, desimal."""
    src = path.read_text()
    fields = {}
    for match in re.finditer(r"\n    (\w+) = models\.(\w+)\(", src):
        chunk = src[match.end() : match.end() + 1200]
        nxt = re.search(r"\n    \w+ = models\.", chunk)
        if nxt:
            chunk = chunk[: nxt.start()]
        label = re.search(r'verbose_name=_\("([^"]+)"\)', chunk)
        target = re.match(r'\s*"([\w\.]+)"', chunk) or re.match(r"\s*(BASE_\w+)", chunk)
        choices = re.search(r"choices=(\w+)", chunk)
        inline_choices = re.search(r"choices=\[(.*?)\]", chunk, re.S)
        places = re.search(r"decimal_places=(\d)", chunk)
        fields[match.group(1)] = {
            "type": match.group(2),
            "label": label.group(1) if label else match.group(1),
            "target": target.group(1) if target else None,
            "choices": choices.group(1) if choices and choices.group(1) != "[" else None,
            "inline_choices": parse_choices(inline_choices.group(1)) if inline_choices else None,
            "places": int(places.group(1)) if places else None,
        }
    consts = {}
    for name, body in re.findall(r"(BASE_\w+) = \"([\w\.]+)\"", src):
        consts[name] = body
    for name, body in re.findall(r"(\w+_CHOICES) = \[(.*?)\]", src, re.S):
        consts[name] = parse_choices(body)
    for field in fields.values():
        if field["target"] in consts:
            field["target"] = consts[field["target"]]
    return fields, consts


def parse_choices(body):
    return [[code, label] for code, label in re.findall(r'\("([^"]*)",\s*_\("([^"]*)"\)\)', body)]


def parse_data(base):
    lists = {}
    for path in sorted((base / "data").glob("*.xml")):
        for model, body in re.findall(
            r'<record id="[^"]*" model="([^"]+)">(.*?)</record>', path.read_text(), re.S
        ):
            if model not in DATA_LISTS:
                continue
            values = dict(re.findall(r'<field name="(\w+)"[^>]*>([^<]*)</field>', body))
            name = DATA_LISTS[model]
            if model == "it_inventory_reason_export":
                name = f"{name}{values.get('document_code', '')}"
            lists.setdefault(name, []).append([values["code"], unescape(values["name"])])
    return lists


def unescape(value):
    return value.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")


class Generator:
    def __init__(self, base):
        self.base = base
        self.data_lists = parse_data(base)
        self.option_lists = {}
        self.list_models = {
            kind: parse_model(base / "models" / f"{model}.py")[0]
            for kind, model in LIST_MODELS.items()
        }

    # Daftar pilihan dari CHOICES model; nama sama dengan isi berbeda diberi akhiran kode dokumen.
    def option_list(self, name, items):
        if name in self.option_lists and self.option_lists[name] != items:
            index = 2
            while f"{name}{index}" in self.option_lists and self.option_lists[f"{name}{index}"] != items:
                index += 1
            name = f"{name}{index}"
        self.option_lists[name] = items
        return name

    def data_list(self, name):
        self.option_lists[name] = self.data_lists[name]
        return name

    def kind_of(self, code, name, field, consts):
        """Jenis isian dari field model hmx."""
        target = field["target"] or ""
        model = target.split(".")[-1]
        if field["type"] == "ForeignKey":
            if model == "it_inventory_pabean_office":
                return {"kind": "ref", "refType": self.port_type(code, name)}
            if model in REF_MODELS:
                return {"kind": "ref", "refType": REF_MODELS[model]}
            if model == "it_inventory_reason_export":
                return {"kind": "option", "list": self.data_list(f"reasonExport{code}" if f"reasonExport{code}" in self.data_lists else "reasonExport261")}
            if model in DATA_LISTS:
                return {"kind": "option", "list": self.data_list(DATA_LISTS[model])}
            if model == "hremployee":
                return {"kind": "text"}
            raise SystemExit(f"BC {code}: model {target} untuk {name} belum dipetakan")
        choices = field["inline_choices"] or consts.get(field["choices"] or "")
        if choices:
            return {"kind": "option", "list": self.option_list(camel(name), choices)}
        if field["type"] == "CharField":
            return {"kind": "text"}
        if field["type"] == "TextField":
            return {"kind": "text", "long": True}
        # Tanggal-waktu hmx diisi sebagai tanggal saja (keputusan user 18/10/2026).
        if field["type"] in ("DateField", "DateTimeField"):
            return {"kind": "date"}
        if field["type"] == "DecimalField":
            return {"kind": "money" if field["places"] == 2 else "qty"}
        if field["type"] == "IntegerField":
            return {"kind": "qty"}
        if field["type"] == "BooleanField":
            return {"kind": "boolean"}
        raise SystemExit(f"BC {code}: jenis {field['type']} untuk {name} belum dipetakan")

    @staticmethod
    def port_type(code, name):
        inbound = code in DIRECTION_IN
        if name in ("loading_export_port", "loading_origin_port"):
            return "domestic_port"
        if name.startswith(("loading", "transit")):
            return "foreign_port" if inbound else "domestic_port"
        return "domestic_port" if inbound else "foreign_port"

    def field(self, code, name, label, fields, consts, page):
        """Isian hmx → isian repo ini (kunci, penyimpanan, jenis), atau None bila dilewati."""
        if name in ("logs", "name", "state"):
            return None
        model = fields.get(name)
        if model is None:
            raise SystemExit(f"BC {code}: field {name} tidak ada di model")
        if name == OFFICE_FIELD[code]:
            return {"key": "customsOfficeCode", "store": "header", "label": label,
                    "kind": "ref", "refType": "customs_office"}
        if name in HEADER_COLUMNS:
            key, kind = HEADER_COLUMNS[name]
            return {"key": key, "store": "header", "label": label, **kind}
        for prefix, role in PARTY_PREFIXES.items():
            if name.startswith(prefix + "_"):
                attr = name[len(prefix) + 1 :]
                key, store = PARTY_ATTRS.get(attr, (camel(attr), "partyDetails"))
                # Pilihan entitas diberi nama per atribut (identityType, codeApi), bukan per peran.
                if attr == "identity_type":
                    kind = {"kind": "option", "list": self.option_list("identityType", consts["IDENTITY_TYPE_CHOICES"])}
                else:
                    kind = self.kind_of(code, attr, model, consts)
                return {"key": key, "store": store, "role": role, "label": label, **kind}
        if name in TRANSPORT_ATTRS:
            # Cara pengangkutan memakai referensi transport_mode (kode sama dengan pilihan hmx).
            if name == "transport_method":
                kind = {"kind": "ref", "refType": "transport_mode"}
            else:
                kind = self.kind_of(code, name, model, consts)
            return {"key": TRANSPORT_ATTRS[name], "store": "transport", "label": label, **kind}
        key = DETAIL_KEYS.get(name)
        if name == "reason_delivery":
            key = "temporaryReasonCode" if code in ("261", "262") else "deliveryReasonCode"
        kind = self.kind_of(code, name, model, consts)
        if key is None:
            key = camel(name) + ("Code" if kind["kind"] in ("ref", "option") else "")
        return {"key": key, "store": "details", "label": label, **kind}

    def list_block(self, code, field_el, field_label):
        name = field_el.get("name")
        kind = next((k for pattern, k in LIST_KINDS if re.fullmatch(pattern, name)), None)
        if kind is None:
            raise SystemExit(f"BC {code}: daftar {name} belum dipetakan")
        title = LABEL_FIXES.get((code, kind)) or field_el.get("string") or field_label
        columns = []
        sub_model = self.list_models[kind]
        for column in field_el.find("list").findall("field"):
            col = column.get("name")
            if column.get("invisible") == "1" or col in ("sequence", "seri") or re.fullmatch(r"document_\d+", col):
                continue
            mapping = LIST_COLUMNS[kind].get(col)
            if mapping is None:
                raise SystemExit(f"BC {code}: kolom {col} di daftar {kind} belum dipetakan")
            key, meta = mapping
            label = column.get("string") or sub_model.get(col, {}).get("label", col)
            columns.append({"key": key, "label": label, **meta})
        return {"title": title or "", "list": kind, "columns": columns}

    def walk(self, code, node, page, blocks, fields, consts):
        """Isi satu tab hmx: grup berjudul jadi blok, grup side_by_side jadi isian sebaris."""
        current = None

        def block(title=None):
            nonlocal current
            current = {"title": title, "fields": []}
            blocks.append(current)
            return current

        def add(item):
            target = current if current is not None and "fields" in current else block()
            target["fields"].append(item)

        for child in node:
            if child.tag == "group":
                title = child.get("string")
                if child.get("layout") == "side_by_side" and title:
                    group_fields = []
                    for sub in child.iter("field"):
                        if sub.get("invisible") == "1":
                            continue
                        mapped = self.field(code, sub.get("name"), sub.get("string") or fields[sub.get("name")]["label"], fields, consts, page)
                        if mapped:
                            group_fields.append(mapped)
                    if group_fields:
                        add({"group": title, "fields": group_fields})
                    continue
                if title:
                    block(title)
                    self.walk(code, child, page, blocks, fields, consts)
                    current = None
                    continue
                inner = []
                self.walk(code, child, page, inner, fields, consts)
                for item in inner:
                    if item.get("title") or "list" in item or current is None:
                        blocks.append(item)
                        if "list" not in item:
                            current = item
                    else:
                        current["fields"].extend(item["fields"])
                continue
            if child.tag == "field":
                if child.get("invisible") == "1":
                    continue
                name = child.get("name")
                label = child.get("string") or fields.get(name, {}).get("label", name)
                if child.find("list") is not None:
                    blocks.append(self.list_block(code, child, fields.get(name, {}).get("label")))
                    current = None
                    continue
                mapped = self.field(code, name, label, fields, consts, page)
                if mapped:
                    add(mapped)
                continue
            self.walk(code, child, page, blocks, fields, consts)

    def form_arch(self, path, record_id=None):
        root = ET.parse(path).getroot()
        for record in root.iter("record"):
            if record_id and record.get("id") != record_id:
                continue
            arch = next((f for f in record.findall("field") if f.get("name") == "arch"), None)
            if arch is not None and arch.find("form") is not None:
                return arch.find("form")
        raise SystemExit(f"Form tidak ditemukan di {path} {record_id or ''}")

    def document(self, code):
        fields, consts = parse_model(self.base / "models" / f"document_{code}.py")
        form = self.form_arch(self.base / "views" / f"document_{code}_views.xml")
        tabs = []
        for page in form.iter("page"):
            label = TAB_FIXES.get(page.get("string"), page.get("string"))
            blocks = []
            self.walk(code, page, label, blocks, fields, consts)
            blocks = [b for b in blocks if "list" in b or b["fields"]]
            # Blok entitas: peran dari isian di dalamnya.
            for b in blocks:
                roles = {f.get("role") for f in flat(b.get("fields", [])) if f.get("role")}
                if len(roles) == 1:
                    b["role"] = roles.pop()
            tabs.append({"key": camel(page.get("name") or label.lower()), "label": label, "blocks": blocks})
        if not any(f["key"] == "customsOfficeCode" for t in tabs for b in t["blocks"] for f in flat(b.get("fields", []))):
            raise SystemExit(f"BC {code}: kantor pabean dokumen ({OFFICE_FIELD[code]}) tidak ada di form")
        parties = []
        for tab in tabs:
            for b in tab["blocks"]:
                role = b.get("role")
                if role and role not in [p["code"] for p in parties]:
                    company = role in COMPANY_ROLES or role in COMPANY_ROLES_PER_DOC.get(code, DEFAULT_COMPANY_EXTRA)
                    parties.append({"code": role, "label": b["title"], "source": "company" if company else "partner"})
                elif role:
                    pass
        return {"tabs": tabs, "parties": parties, "line": self.product_form(code)}

    def product_form(self, code):
        fields, consts = parse_model(self.base / "models" / "document_product.py")
        form = self.form_arch(self.base / "views" / "document_product_views.xml", f"view_it_inventory_document_product_form_{code}")
        blocks = []
        sheet = form.find("sheet")
        for child in sheet:
            if child.tag == "group" and child.get("invisible") == "1":
                continue
            if child.tag == "notebook":
                continue
            self.walk_line(code, child, blocks, fields, consts)
        lartas = None
        for page in form.iter("page"):
            if page.get("name") == "dokumen_lartas":
                field_el = page.find(".//field")
                lartas = {"title": page.get("string"), "columns": self.list_block(code, field_el, None)["columns"]}
        blocks = [b for b in blocks if "list" in b or b["fields"]]
        return {"blocks": blocks, "lartas": lartas}

    def walk_line(self, code, node, blocks, fields, consts):
        current = None

        def target():
            nonlocal current
            if current is None:
                current = {"title": None, "fields": []}
                blocks.append(current)
            return current

        for child in node:
            if child.tag == "group":
                title = child.get("string")
                if child.get("layout") == "side_by_side" and title:
                    items = [self.line_field(code, f.get("name"), f.get("string") or fields[f.get("name")]["label"], fields, consts) for f in child.iter("field")]
                    target()["fields"].append({"group": title, "fields": [i for i in items if i]})
                    continue
                if title:
                    current = {"title": title, "fields": []}
                    blocks.append(current)
                self.walk_line(code, child, blocks, fields, consts)
                current = None
                continue
            if child.tag == "field" and child.find("list") is not None:
                blocks.append(self.list_block(code, child, None))
                current = None
                continue
            if child.tag == "field" and child.get("invisible") != "1":
                item = self.line_field(code, child.get("name"), child.get("string") or fields[child.get("name")]["label"], fields, consts)
                if item:
                    target()["fields"].append(item)

    def line_field(self, code, name, label, fields, consts):
        if name in ("sequence",) or re.fullmatch(r"document_\d+", name):
            return None
        if name == "product":
            return {"key": "product", "store": "line", "label": label, "kind": "product"}
        model = fields[name]
        kind = self.kind_of(code, name, model, consts)
        if name == "hs_code":
            kind = {"kind": "ref", "refType": "hs_code"}
        if name in LINE_COLUMNS:
            return {"key": LINE_COLUMNS[name], "store": "line", "label": label, **kind}
        key = camel(name) + ("Code" if kind["kind"] in ("ref", "option") else "")
        return {"key": key, "store": "lineDetails", "label": label, **kind}


def flat(items):
    for item in items:
        if "group" in item:
            yield from item["fields"]
        else:
            yield item


def main():
    base = Path(sys.argv[1]).expanduser()
    gen = Generator(base)
    layouts = {code: gen.document(code) for code in DOC_CODES}
    # Daftar tetap yang dipakai kolom sub-tabel.
    gen.option_lists.setdefault("taxStatus", parse_model(base / "models" / "document_tax.py")[1]["STATUS_CHOICES"])
    gen.option_lists.setdefault("containerLoad", parse_model(base / "models" / "document_container.py")[1]["LOAD_TYPE_CHOICES"])
    gen.data_list("guaranteeType")
    gen.data_list("bankDevisa")
    header = (
        "// Dibuat oleh scripts/import-customs-forms-from-hmx.py dari form hmx-002 core_it_inventory\n"
        "// (views/document_XX_views.xml, views/document_product_views.xml, models, data). Jangan\n"
        "// diubah manual: ubah pemetaan di script lalu jalankan ulang.\n\n"
        'import type { CustomsDocCode } from "./customs"\n'
        'import type { CustomsLayout } from "./customs-form"\n\n'
    )
    body = (
        "export const HMX_OPTION_LISTS = "
        + json.dumps(gen.option_lists, ensure_ascii=False, indent=2)
        + " as const satisfies Record<string, readonly (readonly [string, string])[]>\n\n"
        + "export const CUSTOMS_LAYOUTS = "
        + json.dumps(layouts, ensure_ascii=False, indent=2)
        + " satisfies Record<CustomsDocCode, CustomsLayout>\n"
    )
    OUTPUT.write_text(header + body)
    print(f"{OUTPUT}: {len(layouts)} jenis, {len(gen.option_lists)} daftar pilihan")


if __name__ == "__main__":
    main()
