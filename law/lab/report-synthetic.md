# Phase 0 report: the hand through the ink

Source: synthetic writers (4). People: 4 (s1, s2, s3, s4). Devices: desktop, phone.

Radius t is chosen as the smallest Hamming distance that keeps the false-reject rate at or under 5%; false-accept rates are read at that t. Enrollment is the per-bit majority of sessions 1–3; genuine tests are sessions 4 and later, same device. Cross-device: enrolled on one device, tested on the other.

| measure | arm | quantize | bits | t | FRR | FRR by device | cross-device FRR | impostor | tracer | copier | stitcher |
|---|---|---|---|---|---|---|---|---|---|---|---|
| facts | B | fixed | 300 | 31 | 3.6% | desktop 3.6%, phone 3.6% | 26.8% | 12.5% | 0.0% | — | 0.0% |
| facts | B | centered | 300 | 31 | 3.6% | desktop 0.0%, phone 7.1% | 33.9% | 12.5% | 0.0% | — | 0.0% |
| facts | B | centered+reliable | 300 | 23 | 1.8% | desktop 0.0%, phone 3.6% | 44.6% | 6.3% | 0.0% | — | 0.0% |
| facts | A | fixed | 36 | 2 | 1.8% | desktop 0.0%, phone 3.6% | 3.6% | 57.5% | 62.5% | 50.0% | — |
| facts | A | centered | 36 | 2 | 1.8% | desktop 0.0%, phone 3.6% | 7.1% | 56.3% | 68.8% | 75.0% | — |
| facts | A | centered+reliable | 36 | 2 | 0.0% | desktop 0.0%, phone 0.0% | 3.6% | 65.0% | 75.0% | 75.0% | — |
| facts | PAGE | fixed | 1092 | 100 | 0.0% | desktop 0.0%, phone 0.0% | 18.8% | — | 25.0% | — | 25.0% |
| facts | PAGE | centered | 1092 | 84 | 0.0% | desktop 0.0%, phone 0.0% | 50.0% | — | 18.8% | — | 12.5% |
| facts | PAGE | centered+reliable | 1092 | 54 | 0.0% | desktop 0.0%, phone 0.0% | 62.5% | — | 0.0% | — | 12.5% |
| raw | B | fixed | 300 | 23 | 3.6% | desktop 7.1%, phone 0.0% | 17.9% | 6.3% | 43.8% | — | 0.0% |
| raw | B | centered | 300 | 18 | 3.6% | desktop 0.0%, phone 7.1% | 30.4% | 6.3% | 31.3% | — | 0.0% |
| raw | B | centered+reliable | 300 | 17 | 3.6% | desktop 0.0%, phone 7.1% | 28.6% | 6.3% | 31.3% | — | 0.0% |
| raw | A | fixed | 36 | 3 | 1.8% | desktop 3.6%, phone 0.0% | 10.7% | 25.0% | 37.5% | 50.0% | — |
| raw | A | centered | 36 | 2 | 3.6% | desktop 7.1%, phone 0.0% | 39.3% | 16.3% | 18.8% | 50.0% | — |
| raw | A | centered+reliable | 36 | 2 | 1.8% | desktop 3.6%, phone 0.0% | 37.5% | 16.7% | 31.3% | 50.0% | — |
| raw | PAGE | fixed | 1092 | 106 | 0.0% | desktop 0.0%, phone 0.0% | 18.8% | — | 50.0% | — | 12.5% |
| raw | PAGE | centered | 1092 | 100 | 0.0% | desktop 0.0%, phone 0.0% | 25.0% | — | 50.0% | — | 12.5% |
| raw | PAGE | centered+reliable | 1092 | 63 | 0.0% | desktop 0.0%, phone 0.0% | 37.5% | — | 37.5% | — | 0.0% |

## Distances

- **facts/B/fixed** genuine: min 9 · median 19 · max 35 (n=56); cross-device: min 15 · median 29 · max 38 (n=56); impostor: min 24 · median 45 · max 67 (n=16); tracer: min 33 · median 53 · max 61 (n=16); copier: —; stitcher: min 38 · median 48 · max 55 (n=8)
- **facts/B/centered** genuine: min 4 · median 17 · max 40 (n=56); cross-device: min 12 · median 29 · max 40 (n=56); impostor: min 26 · median 46 · max 64 (n=16); tracer: min 33 · median 52 · max 59 (n=16); copier: —; stitcher: min 35 · median 48 · max 60 (n=8)
- **facts/B/centered+reliable** genuine: min 1 · median 11 · max 28 (n=56); cross-device: min 6 · median 22 · max 33 (n=56); impostor: min 23 · median 43 · max 56 (n=16); tracer: min 24 · median 47 · max 57 (n=16); copier: —; stitcher: min 33 · median 43 · max 51 (n=8)
- **facts/A/fixed** genuine: min 0 · median 1 · max 3 (n=56); cross-device: min 0 · median 1 · max 3 (n=56); impostor: min 0 · median 2 · max 5 (n=240); tracer: min 0 · median 2 · max 4 (n=16); copier: min 1 · median 3 · max 4 (n=8); stitcher: —
- **facts/A/centered** genuine: min 0 · median 1 · max 3 (n=56); cross-device: min 0 · median 1 · max 4 (n=56); impostor: min 0 · median 2 · max 6 (n=240); tracer: min 1 · median 2 · max 5 (n=16); copier: min 1 · median 2 · max 4 (n=8); stitcher: —
- **facts/A/centered+reliable** genuine: min 0 · median 0 · max 2 (n=56); cross-device: min 0 · median 1 · max 3 (n=56); impostor: min 0 · median 2 · max 6 (n=240); tracer: min 1 · median 2 · max 5 (n=16); copier: min 1 · median 2 · max 4 (n=8); stitcher: —
- **facts/PAGE/fixed** genuine: min 17 · median 62 · max 100 (n=16); cross-device: min 42 · median 86 · max 138 (n=16); impostor: —; tracer: min 66 · median 126 · max 246 (n=16); copier: —; stitcher: min 70 · median 108 · max 164 (n=8)
- **facts/PAGE/centered** genuine: min 12 · median 58 · max 84 (n=16); cross-device: min 39 · median 89 · max 120 (n=16); impostor: —; tracer: min 71 · median 132 · max 232 (n=16); copier: —; stitcher: min 61 · median 110 · max 157 (n=8)
- **facts/PAGE/centered+reliable** genuine: min 6 · median 30 · max 54 (n=16); cross-device: min 31 · median 62 · max 84 (n=16); impostor: —; tracer: min 62 · median 118 · max 194 (n=16); copier: —; stitcher: min 46 · median 98 · max 125 (n=8)
- **raw/B/fixed** genuine: min 4 · median 12 · max 27 (n=56); cross-device: min 4 · median 17 · max 33 (n=56); impostor: min 21 · median 40 · max 59 (n=16); tracer: min 13 · median 27 · max 61 (n=16); copier: —; stitcher: min 49 · median 68 · max 83 (n=8)
- **raw/B/centered** genuine: min 0 · median 8 · max 21 (n=56); cross-device: min 1 · median 14 · max 39 (n=56); impostor: min 13 · median 33 · max 45 (n=16); tracer: min 12 · median 23 · max 59 (n=16); copier: —; stitcher: min 44 · median 60 · max 81 (n=8)
- **raw/B/centered+reliable** genuine: min 0 · median 6 · max 18 (n=56); cross-device: min 1 · median 12 · max 37 (n=56); impostor: min 11 · median 33 · max 45 (n=16); tracer: min 8 · median 23 · max 59 (n=16); copier: —; stitcher: min 42 · median 60 · max 81 (n=8)
- **raw/A/fixed** genuine: min 0 · median 1 · max 5 (n=56); cross-device: min 0 · median 2 · max 5 (n=56); impostor: min 0 · median 5 · max 8 (n=240); tracer: min 2 · median 5 · max 7 (n=16); copier: min 1 · median 4 · max 5 (n=8); stitcher: —
- **raw/A/centered** genuine: min 0 · median 0 · max 3 (n=56); cross-device: min 0 · median 2 · max 6 (n=56); impostor: min 0 · median 5 · max 9 (n=240); tracer: min 1 · median 4 · max 7 (n=16); copier: min 1 · median 4 · max 6 (n=8); stitcher: —
- **raw/A/centered+reliable** genuine: min 0 · median 0 · max 3 (n=56); cross-device: min 0 · median 2 · max 6 (n=56); impostor: min 0 · median 5 · max 8 (n=240); tracer: min 1 · median 4 · max 7 (n=16); copier: min 1 · median 3 · max 6 (n=8); stitcher: —
- **raw/PAGE/fixed** genuine: min 25 · median 69 · max 106 (n=16); cross-device: min 37 · median 80 · max 118 (n=16); impostor: —; tracer: min 55 · median 125 · max 211 (n=16); copier: —; stitcher: min 97 · median 141 · max 166 (n=8)
- **raw/PAGE/centered** genuine: min 15 · median 46 · max 100 (n=16); cross-device: min 23 · median 57 · max 119 (n=16); impostor: —; tracer: min 52 · median 101 · max 209 (n=16); copier: —; stitcher: min 100 · median 133 · max 175 (n=8)
- **raw/PAGE/centered+reliable** genuine: min 10 · median 24 · max 63 (n=16); cross-device: min 14 · median 39 · max 78 (n=16); impostor: —; tracer: min 27 · median 72 · max 177 (n=16); copier: —; stitcher: min 95 · median 118 · max 134 (n=8)

(The best facts/B quantization by stitcher FAR: fixed.)

## Gate (design B, facts measure)

At t = 31 of 300 bits: FRR 3.6%, tracer FAR 0.0%, **stitcher FAR 0.0%** (the deciding number), impostor-with-phrase FAR 12.5%.
FRR and tracer FAR are within the gate; the stitcher number decides.

## Which features separate people (Fisher ratio, B arm)

- facts, strongest: global.aspect 12.15, global.spotsPerInk 11.39, zone3.dark 9.48, zone3.inkCV 8.05, zone5.inkCV 7.77, zone2.inkCV 7.58, zone6.beadHeight 7.46, global.inkCV 7.40
- facts, weakest: zone0.rewet 0.08, zone7.pieces 0.05, zone1.rewet 0.04, zone5.rewet 0.03, zone1.pieces 0.03, zone0.pieces 0.03
- raw, strongest: zone6.right 15.75, global.right 13.22, global.aspect 11.69, zone6.speed 9.21, zone4.speed 8.46, zone3.right 8.40, global.speedQ25 7.92, global.speedQ50 7.84
- raw, weakest: zone6.pressRange 0.00, zone7.pressure 0.00, zone7.pressRange 0.00, zone7.lifts 0.00, global.pressure 0.00, global.pressRange 0.00

Small-sample caveat: 4 people. Rates are counts over few comparisons; treat them as a first look, not a measurement of the population.