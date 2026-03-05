const CONFIG = {
  CLIENT_ID: "857757049045-b05b1g0q7v4ecd07crtcleletpqgkgfl.apps.googleusercontent.com",
  SERVICE_ACCOUNT_EMAIL: "lampa-diario-service@lampa-diario.iam.gserviceaccount.com",
  SCOPES: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",
  SPREADSHEET_TITLE: "Archivio Lampade",
  SHEET_NAME: "Lampade",
  REDIRECT_URI: "https://andreacapello2-sys.github.io/lampa-diario/",
  ANTHROPIC_PROXY: "https://api.anthropic.com/v1/messages",

  STILI: {
    "01": "liberty",
    "02": "vittoriana",
    "03": "postmoderna",
    "04": "futurista",
    "05": "contemporanea"
  },

  TIPI: {
    "01": "da tavolo/da scrivania",
    "02": "piantana",
    "03": "faretto",
    "04": "lampadario",
    "05": "applique"
  },

  COLONNE: [
    "ID", "Stile", "Tipo", "Colore", "Luogo di acquisto",
    "Data di acquisto", "Prezzo", "Descrizione", "Interventi da effettuare"
  ]
};
