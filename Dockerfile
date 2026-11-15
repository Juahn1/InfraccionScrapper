# Servicio `multas`. La imagen oficial de Playwright trae Chromium y sus dependencias del sistema.
# La versión (y el digest) tienen que coincidir con el `playwright` de package.json (1.65.1): si se
# actualiza uno, se actualiza el otro.
FROM mcr.microsoft.com/playwright:v1.65.1-noble@sha256:1507cbfc550a63a6b7396791ca4f00df17beb56342d2447b3f106c306f525579

ENV NODE_ENV=production \
    PORT=8087 \
    # Dentro del contenedor, con un usuario sin privilegios, Chromium no puede armar su sandbox de usuario.
    CHROMIUM_SIN_SANDBOX=true

WORKDIR /app

# pnpm con la misma versión con la que se generó el lockfile (la imagen trae npm pero no corepack; npm solo
# sirve acá para instalar pnpm). Después, solo dependencias de producción y con el lockfile congelado.
RUN npm install -g pnpm@10.17.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY src ./src

# `pwuser` es el usuario sin privilegios que ya trae la imagen de Playwright.
USER pwuser

EXPOSE 8087
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/servicio.js"]
