/**
 * BlindersErpData - bundled local copy of ../data/erp.json (the ERP mockup export).
 * Owns: the ERP snapshot the Lens checks against. Source of truth for names and messages.
 * Privacy (SPEC P1/P3): no network, nothing persisted. Refresh by re-running the copy step
 * when the ERP mockup publishes a new erp.json (generated 2026-10-21 from data/erp.json).
 * Must not: contain anything beyond what the export holds.
 */
export interface ErpExpected { material: string; short: string; boxes: number }
export interface ErpBin { code: string; bin: string; name: string; expected: ErpExpected[] }
export interface ErpBox { code: string; bin: string; material: string; short: string; bestBefore: string | null; status: string; action: string | null }
export interface ErpExport { generated: string; today: string; warehouse: string; bins: ErpBin[]; boxes: ErpBox[] }

export const ERP: ErpExport = {
  "generated": "2026-10-21T08:00:31.233Z",
  "today": "2026-10-21",
  "warehouse": "WH01",
  "bins": [
    {
      "code": "BIN:WH01:A-01-01",
      "bin": "A-01-01",
      "name": "Rack A, level 1 (bottom)",
      "expected": [
        {
          "material": "100201",
          "short": "Grapnel line 50 m",
          "boxes": 1
        },
        {
          "material": "100701",
          "short": "Latex gloves L",
          "boxes": 1
        }
      ]
    },
    {
      "code": "BIN:WH01:A-01-02",
      "bin": "A-01-02",
      "name": "Rack A, level 2",
      "expected": [
        {
          "material": "100101",
          "short": "Arc reactor Mk II",
          "boxes": 2
        }
      ]
    },
    {
      "code": "BIN:WH01:A-01-03",
      "bin": "A-01-03",
      "name": "Rack A, level 3 (top)",
      "expected": [
        {
          "material": "100102",
          "short": "Repulsor, left",
          "boxes": 1
        },
        {
          "material": "100901",
          "short": "Fizzy lifting drink",
          "boxes": 1
        }
      ]
    },
    {
      "code": "BIN:WH01:B-01-01",
      "bin": "B-01-01",
      "name": "Rack B, level 1 (bottom)",
      "expected": [
        {
          "material": "100301",
          "short": "Rocket skates",
          "boxes": 1
        },
        {
          "material": "100801",
          "short": "A4 paper",
          "boxes": 1
        }
      ]
    },
    {
      "code": "BIN:WH01:B-01-02",
      "bin": "B-01-02",
      "name": "Rack B, level 2",
      "expected": [
        {
          "material": "100401",
          "short": "Neural net CPU",
          "boxes": 1
        },
        {
          "material": "100901",
          "short": "Fizzy lifting drink",
          "boxes": 1
        }
      ]
    },
    {
      "code": "BIN:WH01:B-01-03",
      "bin": "B-01-03",
      "name": "Rack B, level 3 (top)",
      "expected": [
        {
          "material": "100501",
          "short": "Cryo seal spray",
          "boxes": 1
        },
        {
          "material": "100601",
          "short": "OZ-2 enhancer",
          "boxes": 1
        }
      ]
    },
    {
      "code": "BIN:WH01:Q-01-01",
      "bin": "Q-01-01",
      "name": "Quarantine, red box under rack B",
      "expected": [
        {
          "material": "100102",
          "short": "Repulsor, left",
          "boxes": 1
        }
      ]
    },
    {
      "code": "BIN:WH01:GR-ZONE",
      "bin": "GR-ZONE",
      "name": "Goods receipt, floor by the door",
      "expected": [
        {
          "material": "100401",
          "short": "Neural net CPU",
          "boxes": 1
        }
      ]
    }
  ],
  "boxes": [
    {
      "code": "00095212340000000013",
      "bin": "A-01-02",
      "material": "100101",
      "short": "Arc reactor Mk II",
      "bestBefore": "2031-09-13",
      "status": "Unrestricted",
      "action": null
    },
    {
      "code": "00095212340000000020",
      "bin": "A-01-02",
      "material": "100101",
      "short": "Arc reactor Mk II",
      "bestBefore": "2031-09-13",
      "status": "Unrestricted",
      "action": null
    },
    {
      "code": "00095212340000000037",
      "bin": "A-01-03",
      "material": "100102",
      "short": "Repulsor, left",
      "bestBefore": null,
      "status": "Unrestricted",
      "action": null
    },
    {
      "code": "00095212340000000044",
      "bin": "A-01-01",
      "material": "100201",
      "short": "Grapnel line 50 m",
      "bestBefore": "2036-07-08",
      "status": "Unrestricted",
      "action": null
    },
    {
      "code": "00095212340000000051",
      "bin": "B-01-01",
      "material": "100301",
      "short": "Rocket skates",
      "bestBefore": null,
      "status": "Unrestricted",
      "action": null
    },
    {
      "code": "00095212340000000068",
      "bin": "B-01-02",
      "material": "100401",
      "short": "Neural net CPU",
      "bestBefore": null,
      "status": "Unrestricted",
      "action": null
    },
    {
      "code": "00095212340000000075",
      "bin": "B-01-03",
      "material": "100501",
      "short": "Cryo seal spray",
      "bestBefore": "2028-05-03",
      "status": "Unrestricted",
      "action": null
    },
    {
      "code": "00095212340000000082",
      "bin": "B-01-03",
      "material": "100601",
      "short": "OZ-2 enhancer",
      "bestBefore": "2027-09-01",
      "status": "Quality inspection",
      "action": "move to quarantine"
    },
    {
      "code": "00095212340000000099",
      "bin": "A-01-01",
      "material": "100701",
      "short": "Latex gloves L",
      "bestBefore": "2031-04-01",
      "status": "Unrestricted",
      "action": null
    },
    {
      "code": "00095212340000000105",
      "bin": "B-01-01",
      "material": "100801",
      "short": "A4 paper",
      "bestBefore": null,
      "status": "Unrestricted",
      "action": null
    },
    {
      "code": "00095212340000000112",
      "bin": "A-01-03",
      "material": "100901",
      "short": "Fizzy lifting drink",
      "bestBefore": "2026-10-28",
      "status": "Unrestricted",
      "action": null
    },
    {
      "code": "00095212340000000129",
      "bin": "B-01-02",
      "material": "100901",
      "short": "Fizzy lifting drink",
      "bestBefore": "2027-03-09",
      "status": "Unrestricted",
      "action": null
    },
    {
      "code": "00095212340000000136",
      "bin": "Q-01-01",
      "material": "100102",
      "short": "Repulsor, left",
      "bestBefore": null,
      "status": "Blocked",
      "action": null
    },
    {
      "code": "00095212340000000143",
      "bin": "GR-ZONE",
      "material": "100401",
      "short": "Neural net CPU",
      "bestBefore": null,
      "status": "Unrestricted",
      "action": "put away B-01-02"
    }
  ]
}
