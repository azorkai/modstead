// Uçak fotoğraflarının kaynakları ve lisansları (Wikimedia Commons). Ayrıntılı liste: CREDITS.md.

export interface PhotoCredit {
  author: string;
  license: string;
  /** Commons dosya sayfası. */
  source: string;
}

export const credits: Record<string, PhotoCredit> = {
  "a330-beluga": {
    author: "MarcelX42",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Hamburg-Finkenwerder_Airport_Airbus_Transport_International_Airbus_A330-743L_Beluga_XL_F-GXLH_(DSC09365).jpg",
  },
  "a330": {
    author: "Adrian Pingstone",
    license: "Public domain",
    source: "https://commons.wikimedia.org/wiki/File:Turkish.a330-200.tc-jnd.arp.jpg",
  },
  "a310": {
    author: "Hugo LUC",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Airbus_A310_-_F-WNOV_AirZeroG_at_LFBT_airport.jpg",
  },
  "a321": {
    author: "Siyuan He",
    license: "Public domain",
    source: "https://commons.wikimedia.org/wiki/File:TAP_Air_Portugal_A321Neo_-_TP257_Lisbon_to_Toronto.jpg",
  },
  "a320": {
    author: "Acroterion",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Frontier_Airbus_A320neo_N334FR_BWI_MD1.jpg",
  },
  "a400m": {
    author: "Julian Herzog",
    license: "CC BY 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Luftwaffe_Airbus_A400M_54-21_Royal_International_Air_Tattoo_2025_03.jpg",
  },
  "b737": {
    author: "Acroterion",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Southwest_Boeing_737-8_MAX_N8748Q_BWI_MD2.jpg",
  },
  "b747": {
    author: "Acroterion",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Lufthansa_Boeing_747-8_D-ABYL_MD1.jpg",
  },
  "b787": {
    author: "Acroterion",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Etihad_Boeing_787-9_A6-BNI_IAD_VA2.jpg",
  },
  "cj4": {
    author: "Duncan Kirk",
    license: "CC BY 4.0",
    source: "https://commons.wikimedia.org/wiki/File:N548AJ_Citation_CJ4,_Salt_Lake_City_07-23-26.jpg",
  },
  "longitude": {
    author: "Duncan Kirk",
    license: "CC BY 4.0",
    source: "https://commons.wikimedia.org/wiki/File:N877QS_Citation_Longitude,_Las_Vegas_01-30-26_(55097871241).jpg",
  },
  "visionjet": {
    author: "ZLEA",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Cirrus_SF50_G2%2B_Vision_Arriv%C3%A9e_(N1808C,_cn_0532)_(4-10-2024).jpg",
  },
  "c152": {
    author: "Rob Hodgkins",
    license: "CC BY-SA 2.0",
    source: "https://commons.wikimedia.org/wiki/File:G-GFID_Cessna_152_Pure_Aviation_Support_Services_CVT_03-07-19_(48212907142).jpg",
  },
  "c172": {
    author: "André Gerwing",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Cessna_172S_Skyhawk_SP_(cn_10678,_D-ETKJ)_2024-04-24_Andre_Gerwing_Collection_ID_018211.jpg",
  },
  "c185": {
    author: "Tomás Del Coro",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:N84TM_1978_Cessna_A185F_Skywagon_II_s_n_18503702_(53432672244).jpg",
  },
  "c208": {
    author: "Timothy A. Gonsalves",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Procharter_Cessna_208B_9J-PCR_Lusaka_Jul23_R16_07454.jpg",
  },
  "c400": {
    author: "Tomás Del Coro",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:N86LP_2008_Cessna_LC41-550FG_Corvalis_TT_C_N_411089_(49763207536).jpg",
  },
  "sr22": {
    author: "ZLEA",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Cirrus_SR22_G2_(N489CD,_cn_1591)_(4-9-2024).jpg",
  },
  "bonanza": {
    author: "Tomás Del Coro",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:N850KS_2015_Beechcraft_G36_Bonanza_s_n_E-4065_(48806945087).jpg",
  },
  "baron": {
    author: "Joao Carlos Medau",
    license: "CC BY 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Raytheon_Baron_G58_PR-FGP_(8476047345).jpg",
  },
  "kingair": {
    author: "Acroterion",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Beechcraft_King_Air_350_N614CW_FDK_MD1.jpg",
  },
  "da40": {
    author: "ZLEA",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Diamond_DA40_NG_Diamond_Star_(N297LA,_cn_40.NC101)_(1-18-2026).jpg",
  },
  "da62": {
    author: "Ronnie Robertson",
    license: "CC BY-SA 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Diamond_DA62_G-VNAV_IMG_8789.jpg",
  },
  "dv20": {
    author: "Huhu Uetersen",
    license: "CC BY 3.0",
    source: "https://commons.wikimedia.org/wiki/File:HOAC_DV20_Katana_(D-ELPP)_02.jpg",
  },
  "tbm": {
    author: "Ronnie Macdonald",
    license: "CC BY 2.0",
    source: "https://commons.wikimedia.org/wiki/File:SOCATA_TBM-930_N930BK_(34517151430).jpg",
  },
  "pc12": {
    author: "James from Cheltenham",
    license: "CC BY-SA 2.0",
    source: "https://commons.wikimedia.org/wiki/File:OK-PMP_Pilatus_PC-12_(30764875434).jpg",
  },
  "pc6": {
    author: "JDrewes, edited by Alvesgaspar",
    license: "CC BY-SA 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Pilatus_PC-6_SkydiveLillo_JD18032008.jpg",
  },
  "pa28": {
    author: "André Gerwing",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Piper_PA-28-236_Dakota_(cn_28-11033,_D-EIGC)_2010-07-14_Andre_Gerwing_Collection_ID_014429.jpg",
  },
  "dhc2": {
    author: "Bill Larkins",
    license: "CC BY-SA 2.0",
    source: "https://commons.wikimedia.org/wiki/File:DHC-2_Mk_I_at_Clear_Lake_(8048720814).jpg",
  },
  "dhc6": {
    author: "Rob Hodgkins",
    license: "CC BY-SA 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Kenn_Borek_Air_C-GKBR_DHC-6-300_Twin_Otter_Coventry_(32741726532).jpg",
  },
  "dc3": {
    author: "Gordon Leggett",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:2017-08-27_Icelandair_Douglas_DC-3_(TF-NPK)_at_Reykjavik,_Iceland.jpg",
  },
  "goose": {
    author: "André Gerwing",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Grumman_G-21A_(c-n_B-100,_N600ZE)_1993-08-01_Andre_Gerwing_Collection_ID_027395.jpg",
  },
  "h4": {
    author: "San Diego Air & Space Museum Archives",
    license: "Public domain",
    source: "https://commons.wikimedia.org/wiki/File:H-4_Hercules_2.jpg",
  },
  "at802": {
    author: "Bidgee",
    license: "CC BY-SA 3.0 au",
    source: "https://commons.wikimedia.org/wiki/File:Pays_Air_Services_(VH-LIR)_Air_Tractor_AT-802_at_Wagga_Wagga_Airport.jpg",
  },
  "cl415": {
    author: "Tsui",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Polemiki_Aeroporia_Canadair_CL-415_2054_Naxos-2025-06-18_0826crop.jpg",
  },
  "savage-cub": {
    author: "Piergiuliano Chesi",
    license: "CC BY 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Zlin_Savage_Cub_D-MVIP_01.JPG",
  },
  "xcub": {
    author: "U.S. Air Force, Richard Eldridge",
    license: "Public domain",
    source: "https://commons.wikimedia.org/wiki/File:CubCrafters_CC19-180_XCub_N17XC_-_6469552.jpg",
  },
  "pitts": {
    author: "Ad Meskens",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Brasschaat_2017_Pitts_S-2_N51AF_03.jpg",
  },
  "extra330": {
    author: "François de Dijon",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Dijon-Darois_-_Extra_330_SC_n%C2%B0_5_-_16.jpg",
  },
  "edge540": {
    author: "Alan Wilson",
    license: "CC BY-SA 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Zivko_Edge_540_%27G-EDGY%27_(12296200973).jpg",
  },
  "mxs": {
    author: "Masakatsu Ukon",
    license: "CC BY-SA 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Red_Bull_Air_Race_Chiba_MXS-R_Matt_Hall.jpg",
  },
  "cap10": {
    author: "Ian Kirk",
    license: "CC BY 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Mudry_CAP-10_Compton_Abbas_30th_June_2013_(9215818423).jpg",
  },
  "dr400": {
    author: "Ad Meskens",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Antwerp_Robin_DR400_at_Stampe_Fly_In_2023_02.jpg",
  },
  "ct": {
    author: "Claudiu Nelega",
    license: "CC BY-SA 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Flight_Design_CTLS_(7502224112).jpg",
  },
  "vl3": {
    author: "André Gerwing",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:JMB_VL-3_RG_Evolution_(D-MRII)_2022-06-11_Andre_Gerwing_Collection_ID_002696.jpg",
  },
  "icon-a5": {
    author: "Greg Goebel",
    license: "CC BY-SA 2.0",
    source: "https://commons.wikimedia.org/wiki/File:ICON_A5_N924BA_at_Felts_Field.jpg",
  },
  "pipistrel": {
    author: "Ad Meskens",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Brasschaat_2017_Pipistrel_Virus_OO-H42.jpg",
  },
  "cgs-hawk": {
    author: "Olga Ernst & Hp.Baumeler",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:V5-USS,_CGS_Hawk_Arrow_II.jpg",
  },
  "jenny": {
    author: "Smithsonian Institution",
    license: "CC0",
    source: "https://commons.wikimedia.org/wiki/File:Curtiss_JN-4D_Jenny_(NASM-SI-2007-13553).jpg",
  },
  "spirit": {
    author: "Znathaniel",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Spirit_of_St._Louis_reproduction_by_JNE_Aircraft_in_flight.jpg",
  },
  "wright": {
    author: "John T. Daniels",
    license: "Public domain",
    source: "https://commons.wikimedia.org/wiki/File:Firstflight_2_cropped.jpg",
  },
  "p51": {
    author: "Julian Herzog",
    license: "CC BY 4.0",
    source: "https://commons.wikimedia.org/wiki/File:North_American_P-51D_Mustang_N6328T_OTT_2013_02.jpg",
  },
  "t6": {
    author: "Acroterion",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:North_American_T-6G_Texan_N6253C_HGR_MD1.jpg",
  },
  "l39": {
    author: "Ministry of Defense of Ukraine",
    license: "CC BY-SA 2.0",
    source: "https://commons.wikimedia.org/wiki/File:L-39_ukrainian_air_force.jpg",
  },
  "a10": {
    author: "U.S. Air Force, William Greer",
    license: "Public domain",
    source: "https://commons.wikimedia.org/wiki/File:Fairchild_Republic_A-10_Thunderbolt_II_-_32156159151.jpg",
  },
  "fa18": {
    author: "U.S. Navy, Dylan McCord",
    license: "Public domain",
    source: "https://commons.wikimedia.org/wiki/File:US_Navy_110514-N-SB672-725_An_F-A-18E_Super_Hornet_assigned_to_the_Argonauts_of_Strike_Fighter_Squadron_(VFA)_147_prepares_for_an_arrested_landing.jpg",
  },
  "xb1": {
    author: "ZLEA",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Boom_XB-1_mockup_(6-17-2025).jpg",
  },
  "dg-ls8": {
    author: "Luftsportverein Bad Gandersheim e.V.",
    license: "CC BY-SA 3.0 de",
    source: "https://commons.wikimedia.org/wiki/File:LS8-18_D-0442_Flugzeug.jpg",
  },
  "dg1001": {
    author: "Reinier044",
    license: "CC0",
    source: "https://commons.wikimedia.org/wiki/File:DG1001-wing-over.jpg",
  },
  "draco": {
    author: "Tomás Del Coro",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:N123T_2008_EADS_PZL_WARSZAWA-OKECIE_SA_PZL-104MA_WILGA_2000_DRACO_s_n_00060024_(33521609548).jpg",
  },
  "optica": {
    author: "TSRL",
    license: "CC BY-SA 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Optica_at_Old_Warden.jpg",
  },
  "es30": {
    author: "Patrik Tommy Olsson",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Heart_Aerospace_X1_Prototype_-_Initial_Rollout.jpg",
  },
  "s12": {
    author: "Tomás Del Coro",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:N11SK_Stemme_AG_Stemme_S_12_Glider_Twin_Voyager_s_n_12-030_(49572633102).jpg",
  },
  "h125": {
    author: "U.S. Navy, Colin Sheridan",
    license: "Public domain",
    source: "https://commons.wikimedia.org/wiki/File:Airbus_H125_-_Los_Angeles_Police_Department_Air_Support_DVIDS7238270.jpg",
  },
  "ec135": {
    author: "Julian Herzog",
    license: "CC BY 4.0",
    source: "https://commons.wikimedia.org/wiki/File:DRF_Eurocopter_EC135_Christoph_44_D-HDRK_G%C3%B6ttingen_2017_06.jpg",
  },
  "bell407": {
    author: "Acroterion",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Bell_407_N777ZA_FDK_MD1.jpg",
  },
  "uh1": {
    author: "Steve Lynes",
    license: "CC BY 2.0",
    source: "https://commons.wikimedia.org/wiki/File:EGVA_-_Bell_UH-1H_Iroquois_-_G-UHIH_72-21509_(48366142262).jpg",
  },
  "r66": {
    author: "Md Shaifuzzaman Ayon",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:S2-AGI_-_Robinson_R66_Turbine_-_Helicopter_-_BCL_Aviation_LTD_-_VGHS.jpg",
  },
  "cabri": {
    author: "Bob Adams",
    license: "CC BY-SA 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Starlite_Cabri_G2_ZT-RSC_(cropped).jpg",
  },
  "s64": {
    author: "Bidgee",
    license: "CC BY-SA 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Erickson_(N176AC)_Sikorsky_S-64E_taxiing_at_Wagga_Wagga_Airport_(6).jpg",
  },
  "magni": {
    author: "Bob Adams",
    license: "CC BY-SA 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Magni_Gyro_M-24_Orion_ZU-RJR_(6779780192).jpg",
  },
  "volocity": {
    author: "Ibex73",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Volocity_at_Paris_Ari_Show_2023_(1).jpg",
  },
  "joby": {
    author: "U.S. Air Force, Harlan Huntington",
    license: "Public domain",
    source: "https://commons.wikimedia.org/wiki/File:Joby_Aviation_S4_experimental_eVTOL_aircraft_at_Edwards_AFB.jpg",
  },
  "blimp": {
    author: "BWard 1997",
    license: "CC BY 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Goodyear_Zeppelin_NT_D-LZFN_Brands_Hatch_2022.jpg",
  },
  "skyship": {
    author: "Tomás Del Coro",
    license: "CC BY-SA 2.0",
    source: "https://commons.wikimedia.org/wiki/File:N610SK_cloud_lab_(Skyship_600)_cn-600-10_(10528896136).jpg",
  },
};
