"""Carte d'alias CURÉE — football-data → The Odds API.

Chaque entrée mappe une CLÉ NORMALISÉE (football-data) vers la CLÉ NORMALISÉE du
MÊME club chez The Odds API. Validée par deux tests MÉCANIQUES (test_curated_map) :
  - co-occurrence : deux nons d'une paire ne jouent jamais la même saison ;
  - volume : après fusion, aucune équipe n'a un nombre de matchs anormal.

⚠️ AJOUTER UN CHAMPIONNAT = ajouter ici ses variantes (étape d'onboarding
obligatoire, voir README). Une variante ABSENTE n'est JAMAIS fusionnée : elle
reste distincte et apparaît dans le rapport des équipes non réconciliées.
"""
from __future__ import annotations

# clé normalisée football-data  ->  clé normalisée The Odds API
CURATED_ALIASES: dict[str, str] = {
    # E0
    'brighton': 'brighton and hove albion',  # « Brighton » → « Brighton and Hove Albion »
    'ipswich': 'ipswich town',  # « Ipswich » → « Ipswich Town »
    'leeds': 'leeds united',  # « Leeds » → « Leeds United »
    'newcastle': 'newcastle united',  # « Newcastle » → « Newcastle United »
    'nott m forest': 'nottingham forest',  # « Nott'm Forest » → « Nottingham Forest »
    'tottenham': 'tottenham hotspur',  # « Tottenham » → « Tottenham Hotspur »
    # B1
    'antwerp': 'royal antwerp',  # « Antwerp » → « Royal Antwerp »
    'cercle brugge': 'cercle brugge ksv',  # « Cercle Brugge » → « Cercle Brugge KSV »
    'kortrijk': 'kv kortrijk',  # « Kortrijk » → « KV Kortrijk »
    'mechelen': 'kv mechelen',  # « Mechelen » → « KV Mechelen »
    'leuven': 'oud heverlee leuven',  # « Leuven » → « Oud-Heverlee Leuven »
    'standard': 'standard liege',  # « Standard » → « Standard Liege »
    'waregem': 'zulte waregem',  # « Waregem » → « SV Zulte-Waregem »
    'st truiden': 'sint truiden',  # « St Truiden » → « Sint Truiden »
    'st gilloise': 'union saint gilloise',  # « St. Gilloise » → « Union Saint-Gilloise »
    # D1
    'koln': '1 koln',  # « FC Koln » → « 1. FC Köln »
    'leverkusen': 'bayer leverkusen',  # « Leverkusen » → « Bayer Leverkusen »
    'dortmund': 'borussia dortmund',  # « Dortmund » → « Borussia Dortmund »
    'm gladbach': 'borussia monchengladbach',  # « M'gladbach » → « Borussia Monchengladbach »
    'ein frankfurt': 'eintracht frankfurt',  # « Ein Frankfurt » → « Eintracht Frankfurt »
    'mainz': 'fsv mainz 05',  # « Mainz » → « FSV Mainz 05 »
    'hoffenheim': 'tsg hoffenheim',  # « Hoffenheim » → « TSG Hoffenheim »
    'stuttgart': 'vfb stuttgart',  # « Stuttgart » → « VfB Stuttgart »
    # SP1
    'ath bilbao': 'athletic bilbao',  # « Ath Bilbao » → « Athletic Bilbao »
    'ath madrid': 'atletico madrid',  # « Ath Madrid » → « Atlético Madrid »
    'celta': 'celta vigo',  # « Celta » → « Celta Vigo »
    'espanol': 'espanyol',  # « Espanol » → « Espanyol »
    'ca osasuna': 'osasuna',  # « CA Osasuna » → « Osasuna »
    'vallecano': 'rayo vallecano',  # « Vallecano » → « Rayo Vallecano »
    'betis': 'real betis',  # « Betis » → « Real Betis »
    'sociedad': 'real sociedad',  # « Sociedad » → « Real Sociedad »
    # I1
    'roma': 'as roma',  # « Roma » → « AS Roma »
    'atalanta': 'atalanta bc',  # « Atalanta » → « Atalanta BC »
    'inter': 'inter milan',  # « Inter » → « Inter Milan »
    # F1
    'monaco': 'as monaco',  # « Monaco » → « AS Monaco »
    'paris sg': 'paris saint germain',  # « Paris SG » → « Paris Saint Germain »
    # P1
    'sp braga': 'braga',  # « Sp Braga » → « Braga »
    'sp lisbon': 'sporting lisbon',  # « Sp Lisbon » → « Sporting Lisbon »
    'maritimo': 'cs maritimo',  # « Maritimo » → « CS Maritimo »
    'guimaraes': 'vitoria',  # « Guimaraes » → « Vitória SC »
    # G1
    'aek': 'aek athens',  # « AEK » → « AEK Athens »
    'aris': 'aris thessaloniki',  # « Aris » → « Aris Thessaloniki »
    'olympiakos': 'olympiakos piraeus',  # « Olympiakos » → « Olympiakos Piraeus »
    'paok': 'paok thessaloniki',  # « PAOK » → « PAOK Thessaloniki »
    'panetolikos': 'panetolikos agrinio',  # « Panetolikos » → « Panetolikos Agrinio »
    'volos': 'volos nfc',  # « Volos FC » → « Volos NFC »
    'kifisia': 'ae kifisia',  # « Kifisia » → « AE Kifisia FC »
    'atromitos': 'atromitos athens',  # « Atromitos » → « Atromitos Athens »
    'levadeiakos': 'levadiakos',  # « Levadeiakos » → « Levadiakos »
    # N1
    'twente': 'twente enschede',  # « Twente » → « FC Twente Enschede »
    'nijmegen': 'nec nijmegen',  # « Nijmegen » → « NEC Nijmegen »
    'for sittard': 'fortuna sittard',  # « For Sittard » → « Fortuna Sittard »
    # T1
    'rizespor': 'caykur rizespor',  # « Rizespor » → « Çaykur Rizespor »
    'goztep': 'goztepe',  # « Goztep » → « Göztepe »
    'kasimpasa': 'kasimpasa sk',  # « Kasimpasa » → « Kasimpasa SK »
    'torku konyaspor': 'konyaspor',  # « Torku Konyaspor » → « Konyaspor »
    'besiktas': 'besiktas jk',  # « Besiktas » → « Beşiktaş JK »
    'gaziantep': 'gazisehir gaziantep',  # « Gaziantep » → « Gazişehir Gaziantep »
    'buyuksehyr': 'basaksehir',  # « Buyuksehyr » → « Basaksehir » (Istanbul Başakşehir, ex-Büyükşehir)
}
