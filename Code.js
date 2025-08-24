const firebaseConfig = {
  apiKey: "AIzaSyC0YFv49AUWjZtEl2KxgiytnFG4bzv5sMA",
  authDomain: "fotocopiado-unaj.firebaseapp.com",
  databaseURL: "https://fotocopiado-unaj-default-rtdb.firebaseio.com/",
  projectId: "fotocopiado-unaj",
  storageBucket: "fotocopiado-unaj.firebasestorage.app",
  messagingSenderId: "198572714385",
  appId: "1:198572714385:web:2ec73dfa4386daa47a5230",
  measurementId: "G-SNQ58PSQJ2",
}

const calcInstitutos = {
  salud: {
    name: "Copiados Salud",
    fullName: "Calculadora de cobro y registro de ventas",
    password: "salud123",
  },
  sociales: {
    name: "Copiados Sociales",
    fullName: "Calculadora de cobro y registro de ventas",
    password: "sociales123",
  },
  ingenieria: {
    name: "Copiados Ingeniería",
    fullName: "Calculadora de cobro y registro de ventas",
    password: "ingenieria123",
  },
}

let firebaseApp
let database
let isFirebaseEnabled = false
let deviceId
let currentFotocopiado
let calcRegistroVentas = {
  efectivo: 0,
  transferencia: 0,
  ventas: [],
}
let calcContadorArchivos = 0
let calcArchivos = []
let calcTotal = 0
let calcMetodoPago
let selectedFotocopiado

const comparativaCharts = {
  ingresos: null,
  metodos: null,
}

let currentTurno = localStorage.getItem("currentTurno") || "TM";

function calcCargarTema() {
  const temaGuardado = localStorage.getItem("calcTema") || "light"
  document.documentElement.setAttribute("data-theme", temaGuardado)
}

function calcToggleTheme() {
  const temaActual = document.documentElement.getAttribute("data-theme")
  const nuevoTema = temaActual === "dark" ? "light" : "dark"

  document.documentElement.setAttribute("data-theme", nuevoTema)
  localStorage.setItem("calcTema", nuevoTema)
}

document.addEventListener("DOMContentLoaded", () => {
  calcCargarTema()
  generateDeviceId()
  checkExistingSession()
  addOutsideClickListener()
  setTimeout(initializeFirebase, 100)

  const propinaInput = document.getElementById("calcPropinaInput")
  if (propinaInput) {
    propinaInput.addEventListener("focus", function() {
      if (this.value === "0") {
        this.value = ""
      }
    })
  }

  const turnoSelect = document.getElementById("turnoSelect");
  if (turnoSelect) {
    turnoSelect.value = currentTurno;
    turnoSelect.onchange = function() {
      currentTurno = this.value;
      localStorage.setItem("currentTurno", currentTurno);
    }
  }

  ["salud", "sociales", "ingenieria"].forEach(tipo => {
    const input = document.getElementById(`passwordInput-${tipo}`);
    if (input) {
      input.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
          login(tipo);
        }
      });
    }
  });
})

function initializeFirebase() {
  try {
    console.log("[v0] Intentando inicializar Firebase...")
    console.log("[v0] window.firebaseInitialized disponible:", typeof window.firebaseInitialized !== "undefined")

    if (typeof window.firebaseInitialized !== "undefined" && window.firebaseInitialized) {
      console.log("[v0] Firebase v9+ detectado, inicializando...")
      firebaseApp = window.firebaseApp
      database = window.firebaseDatabase
      isFirebaseEnabled = true
      updateSyncStatus("🟢", "Conectado a Firebase")
      console.log("[v0] Firebase v9+ inicializado correctamente")

      // Verificar conexión usando la nueva API
      const connectedRef = window.firebaseRef(database, ".info/connected")
      window.firebaseOnValue(connectedRef, (snap) => {
        if (snap.val() === true) {
          console.log("[v0] Conexión a Firebase confirmada")
          updateSyncStatus("🟢", "Conectado a Firebase")
        } else {
          console.log("[v0] Conexión a Firebase perdida")
          updateSyncStatus("🟡", "Reconectando...")
        }
      })
    } else {
      console.warn("[v0] Firebase no disponible, reintentando en 2 segundos...")
      updateSyncStatus("🟡", "Cargando Firebase...")
      setTimeout(initializeFirebase, 2000)
    }
  } catch (error) {
    console.error("[v0] Error inicializando Firebase:", error)
    isFirebaseEnabled = false
    updateSyncStatus("🔴", "Error de conexión")
    setTimeout(initializeFirebase, 3000)
  }
}

function generateDeviceId() {
  deviceId = localStorage.getItem("deviceId")
  if (!deviceId) {
    deviceId = "device_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9)
    localStorage.setItem("deviceId", deviceId)
  }
  console.log("[v0] Device ID:", deviceId)
}

function updateSyncStatus(icon, title) {
  const syncStatus = document.getElementById("syncStatus")
  if (syncStatus) {
    syncStatus.textContent = icon
    syncStatus.title = title
  }
}

function areLocalDataValid() {
  if (!isFirebaseEnabled || !database || !currentFotocopiado) {
    return true 
  }

  return new Promise((resolve) => {
    const fotocopiadoRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`)

    window
      .firebaseGet(fotocopiadoRef)
      .then((snapshot) => {
        const firebaseData = snapshot.val()
        if (!firebaseData) {
          resolve(true)
          return
        }

        const localResetTimestamp = calcRegistroVentas.resetTimestamp || 0
        const firebaseResetTimestamp = firebaseData.resetTimestamp || 0

        resolve(firebaseResetTimestamp <= localResetTimestamp)
      })
      .catch(() => {
        resolve(true)
      })
  })
}

function syncToFirebase() {
  if (!isFirebaseEnabled || !database || !currentFotocopiado) {
    console.log("[v0] Firebase no disponible para sincronización")
    return Promise.resolve()
  }

  return areLocalDataValid().then((isValid) => {
    if (!isValid) {
      console.log("[v0] Datos locales obsoletos detectados, cancelando sincronización")
      return calcCargarDatosIniciales()
    }

    return new Promise((resolve, reject) => {
      try {
        const dataToSync = {
          efectivo: calcRegistroVentas.efectivo || 0,
          transferencia: calcRegistroVentas.transferencia || 0,
          ventas: calcRegistroVentas.ventas || [],
          perdidas: calcRegistroVentas.perdidas || [],
          totalPerdidas: calcRegistroVentas.totalPerdidas || 0,
          lastUpdated: Date.now(),
          deviceId: deviceId,
          resetTimestamp: calcRegistroVentas.resetTimestamp || 0,
        }

        console.log("[v0] Sincronizando a Firebase:", dataToSync)
        console.log("[v0] Ruta Firebase:", `fotocopiados/${currentFotocopiado}`)

        const fotocopiadoRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`)
        window
          .firebaseSet(fotocopiadoRef, dataToSync)
          .then(() => {
            updateSyncStatus("🟢", "Sincronizado")
            console.log("[v0] Datos sincronizados a Firebase correctamente")
            calcRegistroVentas.lastUpdated = dataToSync.lastUpdated
            resolve()
          })
          .catch((error) => {
            console.error("[v0] Error sincronizando a Firebase:", error)
            updateSyncStatus("🔴", "Error de sincronización")
            reject(error)
          })
      } catch (error) {
        console.error("[v0] Error sincronizando a Firebase:", error)
        updateSyncStatus("🔴", "Error de sincronización")
        reject(error)
      }
    })
  })
}

function calcCargarDatosIniciales() {
  return new Promise((resolve) => {
    if (!isFirebaseEnabled || !database || !currentFotocopiado) {
      console.log("[v0] Firebase no disponible, cargando desde localStorage")
      calcCargarDatos()
      resolve()
      return
    }

    console.log("[v0] Cargando datos iniciales desde Firebase...")
    updateSyncStatus("🔄", "Cargando datos...")

    const fotocopiadoRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`)

    window
      .firebaseGet(fotocopiadoRef)
      .then((snapshot) => {
        try {
          const firebaseData = snapshot.val()
          console.log("[v0] Datos de Firebase recibidos:", firebaseData)

          const localData = JSON.parse(localStorage.getItem(`calcRegistroVentas_${currentFotocopiado}`) || "{}")
          const localResetTimestamp = localData.resetTimestamp || 0
          const firebaseResetTimestamp = firebaseData?.resetTimestamp || 0

          if (firebaseData && (firebaseData.ventas || firebaseData.efectivo || firebaseData.transferencia)) {
            if (firebaseResetTimestamp > localResetTimestamp) {
              console.log("[v0] Reset más reciente detectado en Firebase, invalidando datos locales")
              calcRegistroVentas = {
                efectivo: firebaseData.efectivo || 0,
                transferencia: firebaseData.transferencia || 0,
                ventas: firebaseData.ventas || [],
                perdidas: firebaseData.perdidas || [],
                totalPerdidas: firebaseData.totalPerdidas || 0,
                resetTimestamp: firebaseResetTimestamp,
              }
              calcGuardarDatosLocal() 
            } else {
              calcRegistroVentas = {
                efectivo: firebaseData.efectivo || 0,
                transferencia: firebaseData.transferencia || 0,
                ventas: firebaseData.ventas || [],
                resetTimestamp: firebaseResetTimestamp,
              }
              calcGuardarDatosLocal()
            }

            console.log("[v0] Datos cargados desde Firebase:", calcRegistroVentas)
            updateSyncStatus("🟢", "Datos sincronizados desde Firebase")
          } else {
            console.log("[v0] No hay datos en Firebase, cargando desde localStorage")
            calcCargarDatos()

            if (calcRegistroVentas.ventas.length > 0) {
              console.log("[v0] Sincronizando datos locales a Firebase")
              syncToFirebase()
            }
          }
          resolve()
        } catch (error) {
          console.error("[v0] Error cargando desde Firebase:", error)
          calcCargarDatos() 
          updateSyncStatus("🔴", "Error cargando datos")
          resolve()
        }
      })
      .catch((error) => {
        console.error("[v0] Error accediendo a Firebase:", error)
        calcCargarDatos() 
        updateSyncStatus("🔴", "Error de conexión")
        resolve()
      })
  })
}

function calcGuardarDatosLocal() {
  if (!currentFotocopiado) return
  localStorage.setItem(`calcRegistroVentas_${currentFotocopiado}`, JSON.stringify(calcRegistroVentas))
}

function calcGuardarDatos() {
  if (!currentFotocopiado) return

  calcRegistroVentas.lastUpdated = Date.now()
  calcGuardarDatosLocal()

  console.log("[v0] Guardando datos y sincronizando...")
  syncToFirebase().catch((error) => {
    console.error("[v0] Error en sincronización:", error)
  })
}

function calcAgregarArchivo() {
  calcContadorArchivos++
  const container = document.getElementById("calcArchivosContainer")
  const div = document.createElement("div")
  div.className = "calc-card calc-archivo"
  div.id = `calcArchivo${calcContadorArchivos}`

  const numeroArchivo = calcArchivos.length + 1

  div.innerHTML = `
    <div class="calc-card-content">
        <div class="calc-flex-between" style="margin-bottom: 24px; align-items: flex-start;">
            <div style="font-size: 1.2rem; font-weight: 600; color: var(--text-heading);">
                Archivo ${numeroArchivo}
            </div>
            <button onclick="calcEliminarArchivo(${calcContadorArchivos})" class="calc-btn calc-btn-danger" style="margin-left: 0; padding: 6px 12px; font-size: 0.9rem;">
                Eliminar
            </button>
        </div>
        <div class="calc-archivo-form">
            <div class="calc-archivo-row">
                <div>
                    <label class="calc-label">Páginas</label>
                    <input type="number" id="calcPaginas${calcContadorArchivos}" value="1" min="1" 
                        class="calc-input" 
                        onchange="calcActualizarSubtotal(${calcContadorArchivos})"
                        onfocus="if(this.value==='1'){this.value='';}"
                        onblur="if(this.value===''){this.value='1';calcActualizarSubtotal(${calcContadorArchivos});}">
                </div>
                <div>
                    <label class="calc-label">Copias</label>
                    <input type="number" id="calcCopias${calcContadorArchivos}" value="1" min="1"
                        class="calc-input" 
                        onchange="calcActualizarSubtotal(${calcContadorArchivos})"
                        onfocus="if(this.value==='1'){this.value='';}"
                        onblur="if(this.value===''){this.value='1';calcActualizarSubtotal(${calcContadorArchivos});}">
                </div>
            </div>
            <div class="calc-archivo-ajustes">
                <label class="calc-label">Ajustes</label>
                <select id="calcTipo${calcContadorArchivos}" class="calc-select" onchange="calcActualizarSubtotal(${calcContadorArchivos})">
                    <option value="1">Simple/Doble faz</option>
                    <option value="2">Doble faz (2 pág/carilla)</option>
                    <option value="4">Doble faz (4 pág/carilla)</option>
                    <option value="6">Doble faz (6 pág/carilla)</option>
                    <option value="9">Doble faz (9 pág/carilla)</option>
                </select>
            </div>
            <div class="calc-archivo-tipo">
                <label class="calc-label">Tipo de impresion</label>
                <select id="calcColor${calcContadorArchivos}" class="calc-select" onchange="calcActualizarSubtotal(${calcContadorArchivos})">
                    <option value="bn">Blanco y Negro</option>
                    <option value="color">Color</option>
                </select>
            </div>
            <div class="calc-archivo-resumen" id="calcDesc${calcContadorArchivos}" style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 4px;">
                1 hojas × 1 copias
            </div>
            <div class="calc-precio-container">
                <div class="calc-badge calc-badge-large" id="calcSubtotal${calcContadorArchivos}">
                    $40
                </div>
            </div>
        </div>
    </div>
`

  container.appendChild(div)

  calcArchivos.push({
    id: calcContadorArchivos,
    paginas: 1,
    copias: 1,
    tipo: "1",
    color: "bn",
  })
  const propinaInput = document.getElementById("calcPropinaInput")
  if (propinaInput) propinaInput.value = "0"

  calcActualizarSubtotal(calcContadorArchivos)
}

function calcEliminarArchivo(id) {
  if (calcArchivos.length <= 1) {
    alert("Debe haber al menos un archivo.")
    return
  }

  const elemento = document.getElementById(`calcArchivo${id}`)
  if (elemento) {
    elemento.style.transition = "opacity 0.3s ease"
    elemento.style.opacity = "0"
    setTimeout(() => {
      elemento.remove()
      calcArchivos = calcArchivos.filter((archivo) => archivo.id !== id)
      calcReorganizarNombresArchivos()
    }, 300)
  }
}

function calcReorganizarNombresArchivos() {
  const container = document.getElementById("calcArchivosContainer")
  const tarjetas = container.querySelectorAll(".calc-card.calc-archivo")

  tarjetas.forEach((tarjeta, index) => {
    const numeroNuevo = index + 1
    const titulo = tarjeta.querySelector('div[style*="font-size: 1.2rem"]')
    if (titulo) {
      const botonEliminar = titulo.querySelector("button")
      const textoBoton = botonEliminar ? botonEliminar.outerHTML : ""
      titulo.innerHTML = `Archivo ${numeroNuevo} ${textoBoton}`
    }
  })
}

function calcActualizarSubtotal(numeroArchivo) {
  const precioHojaBN = Number.parseFloat(document.getElementById("calcPrecioHoja").value) || 0
  const precioHojaColor = Number.parseFloat(document.getElementById("calcPrecioHojaColor").value) || 0
  const paginas = Number.parseInt(document.getElementById(`calcPaginas${numeroArchivo}`).value) || 0
  const copias = Number.parseInt(document.getElementById(`calcCopias${numeroArchivo}`).value) || 1
  const tipo = document.getElementById(`calcTipo${numeroArchivo}`).value
  const color = document.getElementById(`calcColor${numeroArchivo}`).value

  if (paginas <= 0) {
    const descElement = document.getElementById(`calcDesc${numeroArchivo}`)
    const subtotalElement = document.getElementById(`calcSubtotal${numeroArchivo}`)
    if (descElement && subtotalElement) {
      descElement.textContent = "Error: Debe ingresar más de 0 páginas."
      subtotalElement.textContent = "$0"
    }
    return
  }

  const archivoIndex = calcArchivos.findIndex((a) => a.id === numeroArchivo)
  if (archivoIndex !== -1) {
    calcArchivos[archivoIndex] = { id: numeroArchivo, paginas, copias, tipo, color }
  }

  const paginasPorCarilla = Number.parseInt(tipo) || 1
  const hojasNecesarias = Math.ceil(paginas / paginasPorCarilla)
  const precioHoja = color === "color" ? precioHojaColor : precioHojaBN
  const subtotal = hojasNecesarias * precioHoja * copias

  const descElement = document.getElementById(`calcDesc${numeroArchivo}`)
  const subtotalElement = document.getElementById(`calcSubtotal${numeroArchivo}`)

  if (descElement && subtotalElement) {
    descElement.textContent = `${hojasNecesarias} hojas × ${copias} copias`
    subtotalElement.textContent = `$${subtotal.toLocaleString("es-AR")}`
  }
}

function calcCalcularTotal() {
  const precioHojaBN = Number.parseFloat(document.getElementById("calcPrecioHoja").value)
  const precioHojaColor = Number.parseFloat(document.getElementById("calcPrecioHojaColor").value)

  if (calcArchivos.length === 0) {
    alert("Agrega al menos un archivo.")
    return
  }

  if (!precioHojaBN || precioHojaBN <= 0 || !precioHojaColor || precioHojaColor <= 0) {
    alert("Ingresa precios válidos para las hojas.")
    return
  }

  let totalCalculado = 0

  calcArchivos.forEach((archivo) => {
    const paginasPorCarilla = Number.parseInt(archivo.tipo) || 1;
    const hojasNecesarias = Math.ceil(archivo.paginas / paginasPorCarilla);
    const precioHoja = archivo.color === "color" ? precioHojaColor : precioHojaBN;
    totalCalculado += hojasNecesarias * precioHoja * archivo.copias;
  })


  calcTotal = totalCalculado
  const propinaInput = document.getElementById("calcPropinaInput")
  const propinaLabel = document.getElementById("calcPropinaLabel")
  let propina = 0
  if (propinaInput) {
    propinaInput.style.display = "block"
    propina = Number.parseFloat(propinaInput.value) || 0
  }
  if (propinaLabel) propinaLabel.style.display = "block"
  document.getElementById("calcTotalDisplay").textContent = `Total a cobrar: $${(calcTotal + propina).toLocaleString("es-AR")}${propina > 0 ? ` (Propina: $${propina})` : ""}`
  document.getElementById("calcPagoContainer").style.display = "block"

  calcMetodoPago = null
  document.getElementById("calcEfectivo").checked = false
  document.getElementById("calcTransferencia").checked = false
  document.getElementById("calcDineroCliente").value = ""
  document.getElementById("calcResultadoCambio").style.display = "none"
  document.getElementById("calcBtnFinalizar").disabled = true

  document.getElementById("calcPagoContainer").scrollIntoView({ behavior: "smooth" })

  if (propinaInput) {
    propinaInput.oninput = function() {
      const nuevaPropina = Number.parseFloat(this.value) || 0
      document.getElementById("calcTotalDisplay").textContent = `Total a cobrar: $${(calcTotal + nuevaPropina).toLocaleString("es-AR")}${nuevaPropina > 0 ? ` (Propina: $${nuevaPropina})` : ""}`
    }
  }
}

function calcCancelarVenta() {
  if (confirm("¿Estás seguro de que quieres cancelar la venta actual? Se perderán todos los archivos agregados.")) {
    document.getElementById("calcArchivosContainer").innerHTML = ""

    document.getElementById("calcPagoContainer").style.display = "none"

    // Reset variables
    calcArchivos = []
    calcContadorArchivos = 0
    calcTotal = 0
    calcMetodoPago = null

    calcAgregarArchivo()

    window.scrollTo({ top: 0, behavior: "smooth" })
  }
}

function calcSeleccionarMetodo(metodo) {
  const efectivoCheck = document.getElementById("calcEfectivo")
  const transferenciaCheck = document.getElementById("calcTransferencia")
  const btnFinalizar = document.getElementById("calcBtnFinalizar")

  if (metodo === "efectivo") {
    if (efectivoCheck.checked) {
      calcMetodoPago = "efectivo"
      transferenciaCheck.checked = false
      btnFinalizar.disabled = false
    } else {
      calcMetodoPago = null
      btnFinalizar.disabled = true
    }
  } else {
    if (transferenciaCheck.checked) {
      calcMetodoPago = "transferencia"
      efectivoCheck.checked = false
      btnFinalizar.disabled = false
    } else {
      calcMetodoPago = null
      btnFinalizar.disabled = true
    }
  }
}

function calcCalcularCambio() {
  const dinero = Number.parseFloat(document.getElementById("calcDineroCliente").value)
  const resultado = document.getElementById("calcResultadoCambio")

  if (!dinero || dinero < 0) {
    alert("Ingresa una cantidad válida de dinero.")
    return
  }

  resultado.style.display = "block"
  const cambio = dinero - calcTotal

  if (cambio < 0) {
    resultado.innerHTML = `
            <div style="text-align: center; padding: 20px; background: #fef2f2; border: 2px solid #fca5a5; border-radius: 8px; color: #dc2626;">
                <div style="font-size: 1.2rem; font-weight: 600;">Falta dinero: $${Math.abs(cambio)}</div>
            </div>
        `
  } else {
    resultado.innerHTML = `
            <div style="text-align: center; padding: 20px; background: #f0fdf4; border: 2px solid #86efac; border-radius: 8px;">
                <div style="font-size: 1.2rem; font-weight: 600; color: #059669;">
                    Cambio a devolver: $${cambio}
                </div>
            </div>
        `
  }
}

function calcFinalizarVenta() {
  if (!calcMetodoPago) {
    alert("Por favor selecciona un método de pago.");
    return;
  }

  const ahora = new Date();
  const propina = Number.parseFloat(document.getElementById("calcPropinaInput")?.value) || 0;
  const ventaDetalle = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    fecha: ahora.toLocaleDateString("es-ES"),
    hora: ahora.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
    total: calcTotal + propina,
    propina: propina,
    metodoPago: calcMetodoPago,
    archivos: [...calcArchivos],
    precioHojaBN: Number.parseFloat(document.getElementById("calcPrecioHoja").value),
    precioHojaColor: Number.parseFloat(document.getElementById("calcPrecioHojaColor").value),
    deviceId: deviceId,
    timestamp: Date.now(),
  };

  if (calcMetodoPago === "efectivo") {
    calcRegistroVentas.efectivo += ventaDetalle.total;
  } else {
    calcRegistroVentas.transferencia += ventaDetalle.total;
  }
  calcRegistroVentas.ventas.push(ventaDetalle);

  calcGuardarDatos();

  if (typeof calcActualizarTabla === "function") {
    calcActualizarTabla();
  }

  document.getElementById("calcArchivosContainer").innerHTML = "";
  document.getElementById("calcPagoContainer").style.display = "none";
  calcArchivos = [];
  calcContadorArchivos = 0;
  calcTotal = 0;
  calcMetodoPago = null;
  if (document.getElementById("calcPropinaInput")) document.getElementById("calcPropinaInput").value = "0";
  calcAgregarArchivo();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function calcRestablecerVentas() {
  const password = prompt("Ingresa la contraseña de administrador para restablecer las ventas:")

  if (password === null || password === "") {
    return
  }

  if (password !== "admin123") {
    alert("Contraseña incorrecta. No se puede restablecer el registro de ventas.")
    return
  }

  if (confirm("¿Estás seguro de que deseas restablecer todas las ventas del día?")) {
    const resetTimestamp = Date.now()

    calcRegistroVentas = {
      efectivo: 0,
      transferencia: 0,
      ventas: [],
      resetTimestamp: resetTimestamp,
      isReset: true,
    }

    calcGuardarDatosLocal()
    calcActualizarTabla()

    if (isFirebaseEnabled && database && currentFotocopiado) {
      const fotocopiadoRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`)
      const resetData = {
        efectivo: 0,
        transferencia: 0,
        ventas: [],
        resetTimestamp: resetTimestamp,
        isReset: true,
        lastUpdated: resetTimestamp,
        deviceId: deviceId,
      }

      window
        .firebaseSet(fotocopiadoRef, resetData)
        .then(() => {
          console.log("[v0] Reset sincronizado a Firebase")
          updateSyncStatus("🟢", "Ventas restablecidas y sincronizadas")
        })
        .catch((error) => {
          console.error("[v0] Error sincronizando reset:", error)
        })
    }
  }
}

async function calcRestablecerVentas() {
  const password = prompt("Ingresa la contraseña de administrador para restablecer las ventas:");
  if (password === null || password === "") return;
  if (password !== "admin123") {
    alert("Contraseña incorrecta. No se puede restablecer el registro de ventas.");
    return;
  }

  if (isFirebaseEnabled && database && currentFotocopiado) {
    try {
      // Guardar backup normal
      const ventasRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`);
      const backupRef = window.firebaseRef(database, `backups/${currentFotocopiado}/${Date.now()}`);
      const snapshot = await window.firebaseGet(ventasRef);
      if (snapshot.exists()) {
        await window.firebaseSet(backupRef, snapshot.val());
      }

      // Guardar resumen histórico
      const ahora = new Date();
      const añoMes = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
      const turno = currentTurno || "TM";
      const historicoRef = window.firebaseRef(
        database,
        `historicos/${currentFotocopiado}/${añoMes}/${turno}/${Date.now()}`
      );
      const resumen = {
        ...snapshot.val(),
        fecha: ahora.toLocaleDateString("es-ES"),
        turno: turno,
        timestamp: Date.now(),
      };
      await window.firebaseSet(historicoRef, resumen);
    } catch (error) {
      console.error("Error guardando backup/histórico en Firebase:", error);
    }
  }

  if (confirm("¿Estás seguro de que deseas restablecer todas las ventas del día?")) {
    const resetTimestamp = Date.now();
    calcRegistroVentas = {
      efectivo: 0,
      transferencia: 0,
      ventas: [],
      resetTimestamp: resetTimestamp,
      isReset: true,
    };
    calcGuardarDatosLocal();
    calcActualizarTabla();

    if (isFirebaseEnabled && database && currentFotocopiado) {
      const fotocopiadoRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`);
      const resetData = {
        efectivo: 0,
        transferencia: 0,
        ventas: [],
        resetTimestamp: resetTimestamp,
        isReset: true,
        lastUpdated: resetTimestamp,
        deviceId: deviceId,
      };
      window.firebaseSet(fotocopiadoRef, resetData)
        .then(() => {
          updateSyncStatus("🟢", "Ventas restablecidas y sincronizadas");
        })
        .catch((error) => {
          console.error("Error sincronizando reset:", error);
        });
    }
  }
}

async function calcRecuperarBackup() {
  if (!isFirebaseEnabled || !database || !currentFotocopiado) {
    alert("Firebase no está disponible.");
    return;
  }
  try {
    const backupsRef = window.firebaseRef(database, `backups/${currentFotocopiado}`);
    const snapshot = await window.firebaseGet(backupsRef);
    if (snapshot.exists()) {
      const backups = snapshot.val();
      const timestamps = Object.keys(backups).sort((a, b) => b - a);
      const ultimoBackup = backups[timestamps[0]];
      if (!ultimoBackup) {
        alert("No hay backup disponible.");
        return;
      }
      const ventasRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`);
      await window.firebaseSet(ventasRef, ultimoBackup);
      calcRegistroVentas = {
        efectivo: ultimoBackup.efectivo || 0,
        transferencia: ultimoBackup.transferencia || 0,
        ventas: ultimoBackup.ventas || [],
        perdidas: ultimoBackup.perdidas || [],
        totalPerdidas: ultimoBackup.totalPerdidas || 0,
        resetTimestamp: ultimoBackup.resetTimestamp || Date.now(),
      };
      calcGuardarDatosLocal();
      calcActualizarTabla();
      alert("Backup restaurado correctamente y sincronizado.");
    } else {
      alert("No hay backup disponible.");
    }
  } catch (error) {
    console.error("Error restaurando backup:", error);
    alert("Error al restaurar el backup.");
  }
}

async function calcMostrarComparativa() {
  const calculatorScreen = document.getElementById("calculatorScreen");
  const comparativaScreen = document.getElementById("calcComparativaScreen");
  calculatorScreen.classList.add("animated-fadeOutDown", "animating");
  setTimeout(() => {
    calculatorScreen.style.display = "none";
    calculatorScreen.classList.remove("animated-fadeOutDown", "animating");
    comparativaScreen.style.display = "block";
    comparativaScreen.classList.add("animated-fadeInUp");
    setTimeout(() => {
      comparativaScreen.classList.remove("animated-fadeInUp");
    }, 500);
  }, 400);

  const themeTextComp = document.getElementById("themeTextComp")
  const currentTheme = document.documentElement.getAttribute("data-theme")
  if (themeTextComp) {
    themeTextComp.textContent = currentTheme === "dark" ? "☀️ Claro" : "🌙 Oscuro"
  }

  await calcCargarDatosComparativa()
}

function calcVolverDesdeComparativa() {
  const calculatorScreen = document.getElementById("calculatorScreen");
  const comparativaScreen = document.getElementById("calcComparativaScreen");
  comparativaScreen.classList.add("animated-fadeOutDown", "animating");
  setTimeout(() => {
    comparativaScreen.style.display = "none";
    comparativaScreen.classList.remove("animated-fadeOutDown", "animating");
    calculatorScreen.style.display = "block";
    calculatorScreen.classList.add("animated-fadeInUp");
    setTimeout(() => {
      calculatorScreen.classList.remove("animated-fadeInUp");
    }, 500);
  }, 400);

  if (document.getElementById("calculatorScreen").style.display === "block") {
    document.getElementById("turnoSelectorFixed").style.display = "flex";
  }
}

async function calcCargarDatosComparativa() {
  if (!isFirebaseEnabled || !database) {
    alert("Firebase no está disponible. No se pueden cargar los datos de comparativa.")
    return
  }

  try {
    const institutos = ["salud", "sociales", "ingenieria"]
    const datosInstitutos = {}

    for (const instituto of institutos) {
      const fotocopiadoRef = window.firebaseRef(database, `fotocopiados/${instituto}`)
      const snapshot = await window.firebaseGet(fotocopiadoRef)
      const data = snapshot.val()

      datosInstitutos[instituto] = {
        name: calcInstitutos[instituto].name,
        efectivo: data?.efectivo || 0,
        transferencia: data?.transferencia || 0,
        ventas: data?.ventas || [],
        total: (data?.efectivo || 0) + (data?.transferencia || 0),
        perdidas: (data?.perdidas || []).length,
        totalPerdidas: data?.totalPerdidas || 0 // <-- NUEVO: suma total de pérdidas
      }
    }

    calcMostrarDatosComparativa(datosInstitutos)
  } catch (error) {
    console.error("Error cargando datos de comparativa:", error)
    alert("Error al cargar los datos de comparativa")
  }
}

function calcMostrarDatosComparativa(datos) {
  let totalGeneral = 0
  let ventasTotales = 0
  let institutoLider = ""
  let maxTotal = 0

  Object.values(datos).forEach((instituto) => {
    totalGeneral += instituto.total
    ventasTotales += instituto.ventas.length
    if (instituto.total > maxTotal) {
      maxTotal = instituto.total
      institutoLider = instituto.name
    }
  })

  document.getElementById("calcTotalGeneralComp").textContent = `$${totalGeneral.toLocaleString("es-AR")}`
  document.getElementById("calcInstitutoLider").textContent = institutoLider || "Sin datos"
  document.getElementById("calcVentasTotales").textContent = ventasTotales

  calcCrearGraficoIngresos(datos)
  calcCrearGraficoMetodos(datos)

  calcMostrarDetallesComparativa(datos)
}

function calcCrearGraficoIngresos(datos) {
  const ctx = document.getElementById("calcChartIngresos").getContext("2d")

  if (comparativaCharts.ingresos) {
    comparativaCharts.ingresos.destroy()
  }

  const labels = Object.values(datos).map((d) => d.name)
  const totales = Object.values(datos).map((d) => d.total)

  comparativaCharts.ingresos = new window.Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Ingresos Totales",
          data: totales,
          backgroundColor: [
            "rgba(34, 197, 94, 0.8)", 
            "rgba(59, 130, 246, 0.8)", 
            "rgba(239, 68, 68, 0.8)", 
          ],
          borderColor: ["rgba(34, 197, 94, 1)", "rgba(59, 130, 246, 1)", "rgba(239, 68, 68, 1)"],
          borderWidth: 2,
          borderRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => "$" + value.toLocaleString(),
          },
        },
      },
    },
  })
}

function calcCrearGraficoMetodos(datos) {
  const ctx = document.getElementById("calcChartMetodos").getContext("2d")

  if (comparativaCharts.metodos) {
    comparativaCharts.metodos.destroy()
  }

  const labels = Object.values(datos).map((d) => d.name)
  const efectivo = Object.values(datos).map((d) => d.efectivo)
  const transferencia = Object.values(datos).map((d) => d.transferencia)

  comparativaCharts.metodos = new window.Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Efectivo",
          data: efectivo,
          backgroundColor: "rgba(34, 197, 94, 0.8)",
          borderColor: "rgba(34, 197, 94, 1)",
          borderWidth: 2,
          borderRadius: 8,
        },
        {
          label: "Transferencia",
          data: transferencia,
          backgroundColor: "rgba(59, 130, 246, 0.8)",
          borderColor: "rgba(59, 130, 246, 1)",
          borderWidth: 2,
          borderRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: false,
        },
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => "$" + value.toLocaleString(),
          },
        },
      },
      plugins: {
        legend: {
          position: "top",
        },
      },
    },
  })
}

function calcMostrarDetallesComparativa(datos) {
  const grid = document.getElementById("calcDetallesGrid")
  grid.innerHTML = ""

  Object.entries(datos).forEach(([key, instituto]) => {
    const card = document.createElement("div")
    card.className = "calc-detail-card"

    card.innerHTML = `
  <h4>${instituto.name}</h4>
  <div class="calc-detail-stat">
      <span>Total de Ingresos:</span>
      <span>$${instituto.total.toLocaleString("es-AR")}</span>
  </div>
  <div class="calc-detail-stat">
      <span>Ventas en Efectivo:</span>
      <span>$${instituto.efectivo.toLocaleString("es-AR")}</span>
  </div>
  <div class="calc-detail-stat">
      <span>Ventas por Transferencia:</span>
      <span>$${instituto.transferencia.toLocaleString("es-AR")}</span>
  </div>
  <div class="calc-detail-stat">
      <span>Número de Ventas:</span>
      <span>${instituto.ventas.length}</span>
  </div>
  <div class="calc-detail-stat">
      <span>Promedio por Venta:</span>
      <span>$${instituto.ventas.length > 0 ? Math.round(instituto.total / instituto.ventas.length).toLocaleString("es-AR") : 0}</span>
  </div>
  <div class="calc-detail-stat">
      <span>Pérdidas:</span>
      <span>${instituto.perdidas} ($${instituto.totalPerdidas.toLocaleString("es-AR")})</span>
  </div>
`

    grid.appendChild(card)
  })
}

function mostrarTurnoModal() {
  const modal = document.getElementById("turnoModal");
  const select = document.getElementById("turnoModalSelect");
  const btn = document.getElementById("turnoModalBtn");

  select.value = "";
  modal.style.display = "flex";

  modal.onclick = function(e) {
    if (e.target === modal) {
      e.stopPropagation();
    }
  };

  btn.onclick = function() {
    const turnoElegido = select.value;
    if (!turnoElegido) {
      alert("Debes seleccionar un turno para continuar.");
      return;
    }
    currentTurno = turnoElegido;
    localStorage.setItem("currentTurno", currentTurno);

    const turnoSelect = document.getElementById("turnoSelect");
    if (turnoSelect) turnoSelect.value = currentTurno;

    modal.style.display = "none";
    showCalculatorScreen();
  };
}

function login(tipo = null) {
  const fotocopiadoType = tipo || selectedFotocopiado
  const password = document.getElementById(`passwordInput-${fotocopiadoType}`).value

  if (!fotocopiadoType) {
    alert("Por favor selecciona un fotocopiado")
    return
  }

  if (password === calcInstitutos[fotocopiadoType].password) {
    currentFotocopiado = fotocopiadoType
    localStorage.setItem("currentFotocopiado", currentFotocopiado)
    mostrarTurnoModal();
  } else {
    alert("Contraseña incorrecta")
    const passwordInput = document.getElementById(`passwordInput-${fotocopiadoType}`)
    if (passwordInput) {
      passwordInput.value = ""
      passwordInput.focus()
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const turnoSelect = document.getElementById("turnoSelect");
  if (turnoSelect) {
    turnoSelect.value = currentTurno;
    turnoSelect.onchange = function() {
      currentTurno = this.value;
      localStorage.setItem("currentTurno", currentTurno);
    }
  }
});

function listenToFirebaseChanges() {
  if (!isFirebaseEnabled || !database || !currentFotocopiado) {
    console.log("[v0] Firebase no disponible para escuchar cambios")
    return
  }

  const fotocopiadoRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`)

  window.firebaseOnValue(
    fotocopiadoRef,
    (snapshot) => {
      try {
        if (snapshot.exists()) {
          const data = snapshot.val();
          calcRegistroVentas.efectivo = data.efectivo || 0;
          calcRegistroVentas.transferencia = data.transferencia || 0;
          calcRegistroVentas.ventas = data.ventas || [];
          calcRegistroVentas.perdidas = data.perdidas || [];
          calcRegistroVentas.totalPerdidas = data.totalPerdidas || 0;
          calcRegistroVentas.resetTimestamp = data.resetTimestamp || 0;
          calcRegistroVentas.lastUpdated = data.lastUpdated || 0;
          calcGuardarDatosLocal();
          calcActualizarTabla();
          updateSyncStatus("🔄", "Datos actualizados desde servidor");
        }
      } catch (error) {
        console.error("[v0] Error procesando cambios de Firebase:", error);
      }
    },
    (error) => {
      console.error("[v0] Error escuchando cambios de Firebase:", error);
      updateSyncStatus("🔴", "Error de conexión");
    }
  );
}

function showSyncNotification(message) {
  const notification = document.createElement("div")
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #10b981;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    font-size: 0.9rem;
    max-width: 300px;
    animation: slideIn 0.3s ease-out;
  `
  notification.textContent = message

  const style = document.createElement("style")
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `
  document.head.appendChild(style)

  document.body.appendChild(notification)

  setTimeout(() => {
    notification.style.animation = "slideIn 0.3s ease-out reverse"
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification)
      }
    }, 300)
  }, 3000)
}

function addOutsideClickListener() {
  document.addEventListener("click", (event) => {
    const turnoModal = document.getElementById("turnoModal");
    if (turnoModal && turnoModal.style.display === "flex") {
      if (turnoModal.contains(event.target)) return;
      return;
    }

    const loginScreen = document.getElementById("loginScreen");
    if (!loginScreen || loginScreen.style.display === "none") return;

    const clickedCard = event.target.closest(".fotocopiado-card");
    const clickedPasswordSection = event.target.closest(".password-section-inline");

    if (!clickedCard && !clickedPasswordSection) {
      cancelLogin();
    }
  });
}

function checkExistingSession() {
  localStorage.removeItem("currentFotocopiado")
  currentFotocopiado = null
  showLoginScreen()
}

function showLoginScreen() {
  const loginScreen = document.getElementById("loginScreen");
  const calculatorScreen = document.getElementById("calculatorScreen");
  loginScreen.style.display = "flex";
  calculatorScreen.style.display = "none";
  loginScreen.classList.remove("animated-fadeOutDown", "animating");
  loginScreen.classList.add("animated-fadeInUp");
  setTimeout(() => {
    loginScreen.classList.remove("animated-fadeInUp");
  }, 500);

  document.getElementById("turnoSelectorFixed").style.display = "none";
}

function showCalculatorScreen() {
  const loginScreen = document.getElementById("loginScreen");
  const calculatorScreen = document.getElementById("calculatorScreen");
  loginScreen.classList.add("animated-fadeOutDown", "animating");
  setTimeout(() => {
    loginScreen.style.display = "none";
    loginScreen.classList.remove("animated-fadeOutDown", "animating");
    calculatorScreen.style.display = "block";
    calculatorScreen.classList.add("animated-fadeInUp");
    setTimeout(() => {
      calculatorScreen.classList.remove("animated-fadeInUp");
    }, 500);
  }, 400);

  document.getElementById("turnoSelectorFixed").style.display = "flex";

  if (window.innerWidth <= 900) {
    const header = document.querySelector('.calc-header-text');
    const selector = document.getElementById("turnoSelectorFixed");
    if (header && selector && header.parentNode) {
      header.parentNode.insertBefore(selector, header);
    }
  }

  const fotocopiado = calcInstitutos[currentFotocopiado]
  document.getElementById("fotocopiadoTitle").textContent = fotocopiado.name
  document.getElementById("fotocopiadoSubtitle").textContent = fotocopiado.fullName

  showSyncNotification("Cargando datos más recientes del servidor...")

  loadFromFirebase().then(() => {
    if (calcArchivos.length === 0) {
      calcAgregarArchivo()
    }
    calcActualizarTabla()
    listenToFirebaseChanges()
    setTimeout(() => {
      showSyncNotification("Datos actualizados correctamente")
    }, 1000)
  })
}

function selectFotocopiado(tipo) {
  document.querySelectorAll(".password-section-inline").forEach((section) => {
    section.style.display = "none"
  })

  document.querySelectorAll(".fotocopiado-card").forEach((card) => {
    card.classList.remove("selected")
  })

  event.target.closest(".fotocopiado-card").classList.add("selected")
  selectedFotocopiado = tipo

  const passwordSection = document.getElementById(`passwordSection-${tipo}`)
  const passwordInput = document.getElementById(`passwordInput-${tipo}`)

  if (passwordSection && passwordInput) {
    passwordSection.style.display = "block"
    passwordInput.value = ""
    passwordInput.focus()
  }
}

function login(tipo = null) {
  const fotocopiadoType = tipo || selectedFotocopiado
  const password = document.getElementById(`passwordInput-${fotocopiadoType}`).value

  if (!fotocopiadoType) {
    alert("Por favor selecciona un fotocopiado")
    return
  }

  if (password === calcInstitutos[fotocopiadoType].password) {
    currentFotocopiado = fotocopiadoType
    localStorage.setItem("currentFotocopiado", currentFotocopiado)
    mostrarTurnoModal();
  } else {
    alert("Contraseña incorrecta")
    const passwordInput = document.getElementById(`passwordInput-${fotocopiadoType}`)
    if (passwordInput) {
      passwordInput.value = ""
      passwordInput.focus()
    }
  }
}

function cancelLogin(tipo = null) {
  if (tipo) {
    const passwordSection = document.getElementById(`passwordSection-${tipo}`)
    if (passwordSection) {
      passwordSection.style.display = "none"
    }
    document.querySelectorAll(".fotocopiado-card").forEach((card) => {
      if (card.onclick.toString().includes(tipo)) {
        card.classList.remove("selected")
      }
    })
  } else {
    selectedFotocopiado = null
    document.querySelectorAll(".password-section-inline").forEach((section) => {
      section.style.display = "none"
    })
    document.querySelectorAll(".fotocopiado-card").forEach((card) => {
      card.classList.remove("selected")
    })
  }
}

function logout() {
  if (confirm("¿Estás seguro de que quieres cerrar sesión?")) {
    if (isFirebaseEnabled && database && currentFotocopiado) {
      const fotocopiadoRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`)
      window.firebaseOff(fotocopiadoRef)
    }

    currentFotocopiado = null
    selectedFotocopiado = null
    localStorage.removeItem("currentFotocopiado")
    showLoginScreen()
  }
}

function calcCargarDatos() {
  if (!currentFotocopiado) return

  const datosGuardados = localStorage.getItem(`calcRegistroVentas_${currentFotocopiado}`)
  if (datosGuardados) {
    try {
      calcRegistroVentas = JSON.parse(datosGuardados)
    } catch (error) {
      console.error("Error al cargar datos:", error)
      calcRegistroVentas = {
        efectivo: 0,
        transferencia: 0,
        ventas: [],
      }
    }
  } else {
    calcRegistroVentas = {
      efectivo: 0,
      transferencia: 0,
      ventas: [],
    }
  }
}

function loadFromFirebase() {
  return new Promise((resolve) => {
    if (!isFirebaseEnabled || !database || !currentFotocopiado) {
      console.log("[v0] Firebase no disponible, cargando desde localStorage")
      calcCargarDatos()
      resolve()
      return
    }

    console.log("[v0] Forzando carga de datos más recientes desde Firebase...")
    updateSyncStatus("🔄", "Obteniendo datos actuales...")

    const fotocopiadoRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`)

    window
      .firebaseGet(fotocopiadoRef)
      .then((snapshot) => {
        try {
          const firebaseData = snapshot.val()
          console.log("[v0] Datos más recientes de Firebase:", firebaseData)

          if (firebaseData && (firebaseData.ventas || firebaseData.efectivo || firebaseData.transferencia)) {
            calcRegistroVentas = {
              efectivo: firebaseData.efectivo || 0,
              transferencia: firebaseData.transferencia || 0,
              ventas: firebaseData.ventas || [],
              perdidas: firebaseData.perdidas || [],
              totalPerdidas: firebaseData.totalPerdidas || 0,
              resetTimestamp: firebaseData.resetTimestamp || Date.now(),
            }
            console.log("[v0] Datos actualizados desde Firebase (fuente de verdad):", calcRegistroVentas)
            updateSyncStatus("🟢", "Datos actualizados desde servidor")
          } else {
            console.log("[v0] No hay datos en Firebase, inicializando registro vacío")
            calcRegistroVentas = {
              efectivo: 0,
              transferencia: 0,
              ventas: [],
              resetTimestamp: Date.now(),
            }
            updateSyncStatus("🟢", "Registro inicializado")
          }

          calcGuardarDatosLocal()
          resolve()
        } catch (error) {
          console.error("[v0] Error cargando desde Firebase:", error)
          calcCargarDatos() 
          updateSyncStatus("🔴", "Error cargando datos")
          resolve()
        }
      })
      .catch((error) => {
        console.error("[v0] Error accediendo a Firebase:", error)
        calcCargarDatos() 
        updateSyncStatus("🔴", "Error de conexión")
        resolve()
      })
  })
}

function calcOcultarDetalles() {
  const container = document.getElementById("calcDetallesContainer")
  if (container) {
    container.style.display = "none"
  }
}

function calcExportarExcel() {
  const ahora = new Date()
  const mes = ahora.toLocaleString("es-ES", { month: "long" })
  const año = ahora.getFullYear()
  const fechaHoy = ahora.toLocaleDateString("es-ES")
  const nombreCopiado = calcInstitutos[currentFotocopiado]?.name || "Copiado"

  const ventasEfectivo = (calcRegistroVentas.ventas || []).filter(v => v.metodoPago === "efectivo").map(v => v.total)
  const ventasTransferencia = (calcRegistroVentas.ventas || []).filter(v => v.metodoPago === "transferencia").map(v => v.total)
  const maxFilas = Math.max(ventasEfectivo.length, ventasTransferencia.length, 1)

  const filasVentas = []
  for (let i = 0; i < maxFilas; i++) {
    filasVentas.push([
      ventasEfectivo[i] !== undefined ? `$${ventasEfectivo[i]}` : "",
      ventasTransferencia[i] !== undefined ? `$${ventasTransferencia[i]}` : ""
    ])
  }

  const totalEfectivo = ventasEfectivo.reduce((a, b) => a + (parseFloat(b) || 0), 0)
  const totalTransferencia = ventasTransferencia.reduce((a, b) => a + (parseFloat(b) || 0), 0)
  const totalGeneral = totalEfectivo + totalTransferencia

  const datos = [
    ["Registro de ventas: " + nombreCopiado],
    [`Mes: ${mes.charAt(0).toUpperCase() + mes.slice(1)}   Año: ${año}`],
    [`Desde: ${fechaHoy}   Hasta: ${fechaHoy}`],
    [],
    ["Efectivo", "Transferencia"],
    ...filasVentas,
    [],
    ["Total Efectivo", "Total Transferencia", "Total General"],
    [`$${totalEfectivo}`, `$${totalTransferencia}`, `$${totalGeneral}`]
  ]

  const ws = XLSX.utils.aoa_to_sheet(datos)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Ventas")

  const nombreArchivo = `${nombreCopiado.replace(/\s/g, "_")}_${mes}_${año}.xlsx`
  XLSX.writeFile(wb, nombreArchivo)
}

function calcExportarPDF() {
  const ahora = new Date();
  const mes = ahora.toLocaleString("es-ES", { month: "long" });
  const año = ahora.getFullYear();
  const nombreCopiado = calcInstitutos[currentFotocopiado]?.name || "Copiado";
  const turno = currentTurno === "TM" ? "Mañana" : "Tarde";

  const ventas = calcRegistroVentas.ventas || [];
  const totalEfectivo = ventas.filter(v => v.metodoPago === 'efectivo').reduce((acc, v) => acc + v.total, 0);
  const totalTransferencia = ventas.filter(v => v.metodoPago === 'transferencia').reduce((acc, v) => acc + v.total, 0);
  const totalGeneral = totalEfectivo + totalTransferencia;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(`Registro de Ventas - ${nombreCopiado}`, 14, 18);
  doc.setFontSize(12);
  doc.text(`Mes: ${mes.charAt(0).toUpperCase() + mes.slice(1)} ${año}`, 14, 26);
  doc.text(`Turno: ${turno}`, 14, 34);

  // Tabla de ventas
  const ventasEfectivo = ventas.filter(v => v.metodoPago === 'efectivo').map(v => `$${v.total}`);
  const ventasTransferencia = ventas.filter(v => v.metodoPago === 'transferencia').map(v => `$${v.total}`);
  const maxFilas = Math.max(ventasEfectivo.length, ventasTransferencia.length);
  const tablaVentas = [];
  for (let i = 0; i < maxFilas; i++) {
    tablaVentas.push([
      ventasEfectivo[i] || '',
      ventasTransferencia[i] || ''
    ]);
  }

  let y = 42;
  doc.setFontSize(13);
  doc.text('Ventas:', 14, y);
  y += 8;
  doc.autoTable({
    head: [['Efectivo', 'Transferencia']],
    body: tablaVentas,
    startY: y,
    theme: 'grid',
    styles: { fontSize: 12 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
    bodyStyles: { fillColor: [245, 245, 245] }
  });
  y = doc.lastAutoTable.finalY + 10;

  doc.setFontSize(13);
  doc.text('Totales:', 14, y);
  y += 8;
  doc.autoTable({
    head: [['Concepto', 'Monto']],
    body: [
      ['Total ventas en efectivo', `$${totalEfectivo}`],
      ['Total ventas en transferencia', `$${totalTransferencia}`],
      ['Total general', `$${totalGeneral}`]
    ],
    startY: y,
    theme: 'grid',
    styles: { fontSize: 12 },
    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
    bodyStyles: { fillColor: [245, 245, 245] }
  });

  // Añadir tabla de pérdidas si hay datos
  const perdidas = calcRegistroVentas.perdidas || [];
  if (perdidas.length > 0) {
    y = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(13);
    doc.text('Pérdidas registradas:', 14, y);
    y += 8;
    const tablaPerdidas = perdidas.map(p => [
      p.fecha,
      p.hora,
      p.nombre || "-",
      p.cantidad,
      p.tipo === "color" ? "Color" : "BN",
      p.motivo,
      `$${p.precioUnitario}`,
      `$${p.total}`
    ]);
    doc.autoTable({
      head: [['Fecha', 'Hora', 'Nombre', 'Cantidad', 'Tipo', 'Motivo', 'Precio unitario', 'Total']],
      body: tablaPerdidas,
      startY: y,
      theme: 'grid',
      styles: { fontSize: 11 },
      headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { fillColor: [255, 251, 235] }
    });
  }

  doc.save(`RegistroVentas_${nombreCopiado}_${mes}_${año}_${turno}.pdf`);
}

function calcExportarEstadisticasPDF() {
  const ahora = new Date()
  const mes = ahora.toLocaleString("es-ES", { month: "long" })
  const año = ahora.getFullYear()
  const nombreArchivo = `Estadisticas_copiados_${mes}_${año}.pdf`

  const doc = new window.jspdf.jsPDF("p", "mm", "a4")
  doc.setFontSize(18)
  doc.text(`Estadísticas de Copiados UNAJ`, 14, 22)
  doc.setFontSize(12)
  doc.text(`Mes: ${mes.charAt(0).toUpperCase() + mes.slice(1)}   Año: ${año}`, 14, 32)

  const totalGeneral = document.getElementById("calcTotalGeneralComp")?.textContent || "$0"
  const institutoLider = document.getElementById("calcInstitutoLider")?.textContent || "-"
  const ventasTotales = document.getElementById("calcVentasTotales")?.textContent || "0"

  doc.text(`Total General: ${totalGeneral}`, 14, 42)
  doc.text(`Instituto Líder: ${institutoLider}`, 14, 50)
  doc.text(`Ventas Totales: ${ventasTotales}`, 14, 58)

  const grid = document.getElementById("calcDetallesGrid")
  if (grid) {
    let tabla = [["Instituto", "Total de Ingresos", "Ventas en Efectivo", "Ventas por Transferencia", "Número de Ventas", "Promedio por Venta"]]
    const cards = grid.querySelectorAll(".calc-detail-card")
    cards.forEach(card => {
      const nombre = card.querySelector("h4")?.textContent?.trim() || ""
      const stats = card.querySelectorAll(".calc-detail-stat span:last-child")
      tabla.push([
        nombre,
        stats[0]?.textContent?.trim() || "",
        stats[1]?.textContent?.trim() || "",
        stats[2]?.textContent?.trim() || "",
        stats[3]?.textContent?.trim() || "",
        stats[4]?.textContent?.trim() || ""
      ])
    })
    doc.autoTable({
      head: [tabla[0]],
      body: tabla.slice(1),
      startY: 65,
      styles: { fontSize: 11 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { fillColor: [245, 245, 245] }
    })
  }

  let yOffset = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 10 : 90
  const chartIngresos = document.getElementById("calcChartIngresos")
  const chartMetodos = document.getElementById("calcChartMetodos")

  if (chartIngresos) {
    const imgIngresos = chartIngresos.toDataURL("image/png", 1.0)
    doc.setFontSize(13)
    doc.text("Ingresos por Instituto", 14, yOffset)
    doc.addImage(imgIngresos, "PNG", 14, yOffset + 3, 180, 60)
    yOffset += 68
  }
  if (chartMetodos) {
    const imgMetodos = chartMetodos.toDataURL("image/png", 1.0)
    doc.setFontSize(13)
    doc.text("Métodos de Pago", 14, yOffset)
    doc.addImage(imgMetodos, "PNG", 14, yOffset + 3, 180, 60)
    yOffset += 68
  }

  doc.save(nombreArchivo)
}

async function exportarTodosLosRegistrosPDFZip() {
  const institutos = ["salud", "sociales", "ingenieria"];
  const nombres = {
    salud: "Copiados_Salud",
    sociales: "Copiados_Sociales",
    ingenieria: "Copiados_Ingenieria"
  };
  const zip = new JSZip();
  const ahora = new Date();
  const mes = ahora.toLocaleString("es-ES", { month: "long" });
  const año = ahora.getFullYear();
  const turno = currentTurno || "TM";

  for (const tipo of institutos) {
    let data = null;
    if (isFirebaseEnabled && database) {
      const ref = window.firebaseRef(database, `fotocopiados/${tipo}`);
      const snap = await window.firebaseGet(ref);
      data = snap.exists() ? snap.val() : { efectivo: 0, transferencia: 0, ventas: [], perdidas: [], totalPerdidas: 0 };
    } else {
      // Cargar todos los campos, incluyendo perdidas y totalPerdidas
      data = JSON.parse(localStorage.getItem(`calcRegistroVentas_${tipo}`) || "{}");
      if (!data.perdidas) data.perdidas = [];
      if (!data.totalPerdidas) data.totalPerdidas = 0;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Registro de Ventas - ${nombres[tipo]}`, 14, 18);
    doc.setFontSize(12);
    doc.text(`Mes: ${mes.charAt(0).toUpperCase() + mes.slice(1)} ${año}`, 14, 26);
    doc.text(`Turno: ${turno === "TM" ? "Mañana" : "Tarde"}`, 14, 34);

    // Ventas
    const ventas = data.ventas || [];
    const totalEfectivo = ventas.filter(v => v.metodoPago === 'efectivo').reduce((acc, v) => acc + v.total, 0);
    const totalTransferencia = ventas.filter(v => v.metodoPago === 'transferencia').reduce((acc, v) => acc + v.total, 0);
    const totalGeneral = totalEfectivo + totalTransferencia;
    const ventasEfectivo = ventas.filter(v => v.metodoPago === 'efectivo').map(v => `$${v.total}`);
    const ventasTransferencia = ventas.filter(v => v.metodoPago === 'transferencia').map(v => `$${v.total}`);
    const maxFilas = Math.max(ventasEfectivo.length, ventasTransferencia.length);
    const tablaVentas = [];
    for (let i = 0; i < maxFilas; i++) {
      tablaVentas.push([
        ventasEfectivo[i] || '',
        ventasTransferencia[i] || ''
      ]);
    }
    let y = 42;
    doc.setFontSize(13);
    doc.text('Ventas:', 14, y);
    y += 8;
    doc.autoTable({
      head: [['Efectivo', 'Transferencia']],
      body: tablaVentas,
      startY: y,
      theme: 'grid',
      styles: { fontSize: 12 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { fillColor: [245, 245, 245] }
    });
    y = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(13);
    doc.text('Totales:', 14, y);
    y += 8;
    doc.autoTable({
      head: [['Concepto', 'Monto']],
      body: [
        ['Total ventas en efectivo', `$${totalEfectivo}`],
        ['Total ventas en transferencia', `$${totalTransferencia}`],
        ['Total general', `$${totalGeneral}`]
      ],
      startY: y,
      theme: 'grid',
      styles: { fontSize: 12 },
      headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { fillColor: [245, 245, 245] }
    });

    // Añadir tabla de pérdidas si hay datos
    const perdidas = data.perdidas || [];
    if (perdidas.length > 0) {
      y = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(13);
      doc.text('Pérdidas registradas:', 14, y);
      y += 8;
      const tablaPerdidas = perdidas.map(p => [
        p.fecha,
        p.hora,
        p.nombre || "-",
        p.cantidad,
        p.tipo === "color" ? "Color" : "BN",
        p.motivo,
        `$${p.precioUnitario}`,
        `$${p.total}`
      ]);
      doc.autoTable({
        head: [['Fecha', 'Hora', 'Nombre', 'Cantidad', 'Tipo', 'Motivo', 'Precio unitario', 'Total']],
        body: tablaPerdidas,
        startY: y,
        theme: 'grid',
        styles: { fontSize: 11 },
        headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold' },
        bodyStyles: { fillColor: [255, 251, 235] }
      });
    }

    const nombrePDF = `${nombres[tipo]}_${mes}_${año}_${turno}.pdf`;
    const pdfBlob = doc.output("blob");
    zip.file(nombrePDF, pdfBlob);
  }

  const nombreZip = `Registros_Copiados_UNAJ_${mes}_${año}_${turno}.zip`;
  zip.generateAsync({ type: "blob" }).then(function(content) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = nombreZip;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    }, 100);
  });
}

function calcActualizarTabla() {
  const efectivo = calcRegistroVentas.efectivo || 0;
  const transferencia = calcRegistroVentas.transferencia || 0;
  const total = efectivo + transferencia;
  const ventasEfectivo = (calcRegistroVentas.ventas || []).filter(v => v.metodoPago === "efectivo").length;
  const ventasTransferencia = (calcRegistroVentas.ventas || []).filter(v => v.metodoPago === "transferencia").length;
  const ventasTotales = (calcRegistroVentas.ventas || []).length;


  document.getElementById("calcTotalEfectivo").innerText = `$${efectivo.toLocaleString("es-AR")}`;
  document.getElementById("calcTotalTransferencia").innerText = `$${transferencia.toLocaleString("es-AR")}`;
  document.getElementById("calcTotalGeneral").innerText = `$${total.toLocaleString("es-AR")}`;
  document.getElementById("calcCountEfectivo").innerText = ventasEfectivo;
  document.getElementById("calcCountTransferencia").innerText = ventasTransferencia;
  document.getElementById("calcTotalVentas").innerText = `${ventasTotales} ventas`;

  document.getElementById("calcTotalEfectivoMobile").innerText = `$${efectivo.toLocaleString("es-AR")}`;
  
   document.getElementById("calcTotalTransferenciaMobile").innerText = `$${transferencia.toLocaleString("es-AR")}`;
  document.getElementById("calcTotalGeneralMobile").innerText = `$${total.toLocaleString("es-AR")}`;
  document.getElementById("calcCountEfectivoMobile").innerText = ventasEfectivo;
  document.getElementById("calcCountTransferenciaMobile").innerText = ventasTransferencia;
  document.getElementById("calcTotalVentasMobile").innerText = `${ventasTotales} ventas`;
}

function calcMostrarDetalles(tipo) {
  const container = document.getElementById("calcDetallesContainer");
  const content = document.getElementById("calcDetallesContent");
  const title = document.getElementById("calcDetallesTitle");

  const ventas = (calcRegistroVentas.ventas || []).filter(v => v.metodoPago === tipo);

  title.textContent = `Detalles de Ventas (${tipo === "efectivo" ? "Efectivo" : "Transferencia"})`;

  const ajustesOpciones = {
    "1": "Simple/Doble faz",
    "2": "Doble faz (2 pág/carilla)",
    "4": "Doble faz (4 pág/carilla)",
    "6": "Doble faz (6 pág/carilla)",
    "9": "Doble faz (9 pág/carilla)"
  };

  if (ventas.length === 0) {
    content.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-secondary);">No hay ventas registradas para este método de pago.</div>`;
  } else {
    content.innerHTML = ventas.map((venta, idx) => `
      <div class="calc-venta-item" style="margin-bottom:18px;">
        <ul>
          <li><b>#${idx + 1}</b> - <b>Fecha:</b> ${venta.fecha} <b>Hora:</b> ${venta.hora}</li>
          <li><b>Total:</b> $${venta.total.toLocaleString("es-AR")}${venta.propina && venta.propina > 0 ? ` (Propina: $${venta.propina})` : ""}</li>
                            <li><b>Precios:</b> BN $${venta.precioHojaBN} / Color $${venta.precioHojaColor}</li>
        </ul>
        <div style="margin-top:10px;">
          <b>Archivos de la venta:</b>
          <div>
            ${venta.archivos.map((archivo, i) => {
              const paginasPorCarilla = Number.parseInt(archivo.tipo) || 1;
              const hojasNecesarias = Math.ceil(archivo.paginas / paginasPorCarilla);
              const precioHoja = archivo.color === "color" ? venta.precioHojaColor : venta.precioHojaBN;
              const precioArchivo = hojasNecesarias * precioHoja * archivo.copias;
              return `
                <div style="margin:10px 0; padding:10px; border-radius:8px; background:var(--bg-card-header); border:1px solid var(--border-color);">
                  <b>Archivo ${i + 1}</b><br>
                  <b>Páginas:</b> ${archivo.paginas} &nbsp; 
                  <b>Copias:</b> ${archivo.copias} &nbsp; 
                  <b>Ajuste:</b> ${ajustesOpciones[archivo.tipo] || archivo.tipo} &nbsp; 
                  <b>Tipo impresión:</b> ${archivo.color === "color" ? "Color" : "Blanco y Negro"}<br>
                  <b>Precio archivo:</b> $${precioArchivo.toLocaleString("es-AR")}
                </div>
              `;
            }).join("")}
          </div>
        </div>
        <div style="margin-top:12px; display:flex; flex-wrap:wrap; gap:10px;">
          <button class="calc-btn calc-btn-danger" onclick="eliminarVentaPorIndice(${getVentaIndiceGlobal(venta)}, '${tipo}')">Eliminar</button>
          <button class="calc-btn calc-btn-secondary" onclick="cambiarMetodoPagoVenta(${getVentaIndiceGlobal(venta)}, '${tipo}')">Cambiar método de pago</button>
          <button class="calc-btn calc-btn-success" onclick="mostrarPropinaDetalle(${getVentaIndiceGlobal(venta)})">Agregar/Modificar propina</button>
        </div>
      </div>
    `).join("");
  }

  container.style.display = "block";
  container.style.maxHeight = "80vh";
  container.style.overflowY = "auto";
  container.style.minHeight = "500px";
  window.ventaDetalleIdMostrado = null;
}

function getVentaIndiceGlobal(venta) {
  return (calcRegistroVentas.ventas || []).findIndex(v => v.id === venta.id);
}

function eliminarVentaPorIndice(idx, tipo) {
  if (!confirm("¿Seguro que deseas eliminar esta venta?")) return;
  const venta = calcRegistroVentas.ventas[idx];
  if (!venta) return;
  if (venta.metodoPago === "efectivo") {
    calcRegistroVentas.efectivo -= venta.total;
  } else {
    calcRegistroVentas.transferencia -= venta.total;
  }
  calcRegistroVentas.ventas.splice(idx, 1);
  calcGuardarDatos();
  calcActualizarTabla();
  calcMostrarDetalles(tipo);
}

function cambiarMetodoPagoVenta(idx, tipoActual) {
  const venta = calcRegistroVentas.ventas[idx];
  if (!venta) return;
  if (venta.metodoPago === "efectivo") {
    calcRegistroVentas.efectivo -= venta.total;
    calcRegistroVentas.transferencia += venta.total;
    venta.metodoPago = "transferencia";
  } else {
    calcRegistroVentas.transferencia -= venta.total;
    calcRegistroVentas.efectivo += venta.total;
    venta.metodoPago = "efectivo";
  }
  calcGuardarDatos();
  calcActualizarTabla();
  calcMostrarDetalles(tipoActual);
  showSyncNotification("La venta fue movida al otro método de pago. Haz clic en 'Ver detalles' del otro método para verla.");
}

function mostrarPropinaDetalle(idx) {
  const venta = calcRegistroVentas.ventas[idx];
  if (!venta) return;
  const nuevaPropina = prompt("Ingrese la nueva propina para esta venta:", venta.propina || 0);
  if (nuevaPropina === null) return;
  const propinaNum = Number.parseFloat(nuevaPropina) || 0;
  if (venta.metodoPago === "efectivo") {
    calcRegistroVentas.efectivo -= venta.total;
    venta.total = venta.total - (venta.propina || 0) + propinaNum;
    calcRegistroVentas.efectivo += venta.total;
  } else {
    calcRegistroVentas.transferencia -= venta.total;
    venta.total = venta.total - (venta.propina || 0) + propinaNum;
    calcRegistroVentas.transferencia += venta.total;
  }
  venta.propina = propinaNum;
  calcGuardarDatos();
  calcActualizarTabla();
  calcMostrarDetalles(venta.metodoPago);
}

function pedirPasswordRecuperarBackup() {
  const pass = prompt("Ingrese la contraseña de administrador para recuperar el último registro:");
  if (pass !== "admin123") {
    alert("Contraseña incorrecta. No se realizó la acción.");
    return;
  }
  calcRecuperarBackup();
}

async function calcRecuperarBackup() {
  if (isFirebaseEnabled && database && currentFotocopiado) {
    try {
      const backupsRef = window.firebaseRef(database, `backups/${currentFotocopiado}`);
      const snapshot = await window.firebaseGet(backupsRef);
      if (snapshot.exists()) {
        const backups = snapshot.val();
        const timestamps = Object.keys(backups).sort((a, b) => b - a);
        const ultimoBackup = backups[timestamps[0]];
        if (!ultimoBackup) {
          alert("No hay backup disponible.");
          return;
        }
        const ventasRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`);
        await window.firebaseSet(ventasRef, ultimoBackup);
        calcRegistroVentas = {
          efectivo: ultimoBackup.efectivo || 0,
          transferencia: ultimoBackup.transferencia || 0,
          ventas: ultimoBackup.ventas || [],
          perdidas: ultimoBackup.perdidas || [],
          totalPerdidas: ultimoBackup.totalPerdidas || 0,
          resetTimestamp: ultimoBackup.resetTimestamp || Date.now(),
        };
        calcGuardarDatosLocal();
        calcActualizarTabla();
        alert("Backup restaurado correctamente y sincronizado.");
      } else {
        alert("No hay backup disponible.");
      }
    } catch (error) {
      console.error("Error restaurando backup:", error);
      alert("Error al restaurar el backup.");
    }
  } else {
    const backup = localStorage.getItem(`calcRegistroVentas_backup_${currentFotocopiado}`);
    if (backup) {
      try {
        calcRegistroVentas = JSON.parse(backup);
        calcGuardarDatosLocal();
        calcActualizarTabla();
        alert("Backup local restaurado correctamente.");
      } catch (e) {
        alert("Error al restaurar el backup local.");
      }
    } else {
      alert("No hay backup local disponible.");
    }
  }
}

function actualizarYRefrescarTabla() {
  loadFromFirebase().then(() => {
    calcActualizarTabla();
    showSyncNotification("Datos actualizados desde el servidor.");
  });
}

if (!calcRegistroVentas.perdidas) {
  calcRegistroVentas.perdidas = [];
}

function mostrarModalPerdidas() {
  let modal = document.getElementById("modalPerdidas");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "modalPerdidas";
    modal.style.cssText = `
      position:fixed;z-index:3000;top:0;left:0;width:100vw;height:100vh;
      background:rgba(30,41,59,0.45);backdrop-filter:blur(2px);
      display:flex;align-items:center;justify-content:center;
    `;
    modal.innerHTML = `
      <div style="background:var(--bg-card);padding:32px 24px;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,0.18);max-width:95vw;width:340px;text-align:center;">
        <h2 style="margin-bottom:18px;font-size:1.2rem;color:var(--text-heading);">Registrar pérdida</h2>
        <div style="margin-bottom:14px;">
          <label style="font-weight:600;">Nombre y apellido:</label>
          <input type="text" id="perdidasNombre" maxlength="60" class="calc-input" style="margin-top:6px;" placeholder="Nombre y apellido">
        </div>
        <div style="margin-bottom:14px;">
          <label style="font-weight:600;">Cantidad de hojas:</label>
          <input type="number" id="perdidasCantidad" min="1" value="1" class="calc-input" style="margin-top:6px;">
        </div>
        <div style="margin-bottom:14px;">
          <label style="font-weight:600;">Motivo:</label>
          <input type="text" id="perdidasMotivo" maxlength="80" class="calc-input" style="margin-top:6px;">
        </div>
        <div style="margin-bottom:18px;">
          <label style="font-weight:600;">Tipo:</label>
          <select id="perdidasTipo" class="calc-select" style="margin-top:6px;">
            <option value="bn">Blanco y Negro</option>
            <option value="color">Color</option>
          </select>
        </div>
        <div style="display:flex;gap:10px;">
          <button class="calc-btn calc-btn-primary" id="btnAgregarPerdida">Agregar</button>
          <button class="calc-btn calc-btn-secondary" id="btnCancelarPerdida">Cancelar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  } else {
    modal.style.display = "flex";
  }

  document.getElementById("btnAgregarPerdida").onclick = function() {
    const nombre = document.getElementById("perdidasNombre").value.trim();
    const cantidad = parseInt(document.getElementById("perdidasCantidad").value) || 0;
    const motivo = document.getElementById("perdidasMotivo").value.trim();
    const tipo = document.getElementById("perdidasTipo").value;
    if (!nombre || cantidad <= 0 || !motivo) {
      alert("Debe ingresar nombre y apellido, una cantidad válida y un motivo.");
      return;
    }
    agregarPerdidaRegistro(cantidad, motivo, tipo, nombre);
    modal.style.display = "none";
  };
  document.getElementById("btnCancelarPerdida").onclick = function() {
    modal.style.display = "none";
  };
}

function agregarPerdidaRegistro(cantidad, motivo, tipo, nombre) {
  const precioHojaBN = Number.parseFloat(document.getElementById("calcPrecioHoja").value) || 0;
  const precioHojaColor = Number.parseFloat(document.getElementById("calcPrecioHojaColor").value) || 0;
  const precio = tipo === "color" ? precioHojaColor : precioHojaBN;
  const total = cantidad * precio;
  const perdida = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    fecha: new Date().toLocaleDateString("es-ES"),
    hora: new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
    cantidad,
    motivo,
    tipo,
    nombre: nombre || "",
    precioUnitario: precio,
    total,
    deviceId: deviceId,
    timestamp: Date.now()
  };
  if (!calcRegistroVentas.perdidas) calcRegistroVentas.perdidas = [];
  calcRegistroVentas.perdidas.push(perdida);
  calcRegistroVentas.totalPerdidas = (calcRegistroVentas.totalPerdidas || 0) + total;
  calcGuardarDatos();
  calcActualizarTabla();
  showSyncNotification("Pérdida registrada y sincronizada.");
}

const oldCalcActualizarTabla = calcActualizarTabla;
calcActualizarTabla = function() {
  oldCalcActualizarTabla();
  const totalPerdidas = calcRegistroVentas.totalPerdidas || 0;
  let perdidasRow = document.getElementById("calcTotalPerdidasRow");
  if (!perdidasRow) {
    const table = document.querySelector(".calc-table tbody");
    if (table) {
      perdidasRow = document.createElement("tr");
      perdidasRow.id = "calcTotalPerdidasRow";
      perdidasRow.innerHTML = `
        <td>Pérdidas</td>
        <td style="text-align: right; font-family: monospace; font-size: 1.1rem;" id="calcTotalPerdidas">$0</td>
        <td style="text-align: center;">
          <button onclick="calcMostrarDetalles('perdidas')" class="calc-btn calc-btn-outline" style="padding: 6px 12px; font-size: 0.9rem;">
            Ver detalles (<span id="calcCountPerdidas">0</span>)
          </button>
        </td>
      `;
      table.insertBefore(perdidasRow, table.lastElementChild);
    }
    const mobile = document.querySelector(".calc-table-mobile");
    if (mobile && !document.getElementById("calcTotalPerdidasMobile")) {
      const card = document.createElement("div");
      card.className = "calc-mobile-card";
      card.innerHTML = `
        <div class="calc-mobile-card-header">
          <span>Pérdidas</span>
          <span class="calc-mobile-card-total" id="calcTotalPerdidasMobile">$0</span>
        </div>
        <div class="calc-mobile-card-actions">
          <button onclick="calcMostrarDetalles('perdidas')" class="calc-btn calc-btn-outline" style="padding: 8px 16px; font-size: 0.9rem;">
            Ver detalles (<span id="calcCountPerdidasMobile">0</span>)
          </button>
        </div>
      `;
      mobile.insertBefore(card, mobile.lastElementChild);
    }
  }
  document.getElementById("calcTotalPerdidas").innerText = `$${totalPerdidas.toLocaleString("es-AR")}`;
  document.getElementById("calcTotalPerdidasMobile").innerText = `$${totalPerdidas.toLocaleString("es-AR")}`;
  const count = (calcRegistroVentas.perdidas || []).length;
  document.getElementById("calcCountPerdidas").innerText = count;
  document.getElementById("calcCountPerdidasMobile").innerText = count;
};

const oldCalcMostrarDetalles = calcMostrarDetalles;
calcMostrarDetalles = function(tipo) {
  if (tipo !== "perdidas") {
    oldCalcMostrarDetalles(tipo);
    return;
  }
  const container = document.getElementById("calcDetallesContainer");
  const content = document.getElementById("calcDetallesContent");
  const title = document.getElementById("calcDetallesTitle");
  const perdidas = calcRegistroVentas.perdidas || [];
  title.textContent = "Detalles de Pérdidas";
  if (perdidas.length === 0) {
    content.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-secondary);">No hay pérdidas registradas.</div>`;
  } else {
    content.innerHTML = perdidas.map((p, idx) => `
      <div class="calc-venta-item" style="margin-bottom:18px;">
        <ul>
          <li><b>#${idx + 1}</b> - <b>Fecha:</b> ${p.fecha} <b>Hora:</b> ${p.hora}</li>
          <li><b>Nombre y apellido:</b> ${p.nombre ? p.nombre : "-"}</li>
          <li><b>Cantidad de hojas:</b> ${p.cantidad}</li>
          <li><b>Motivo:</b> ${p.motivo}</li>
          <li><b>Tipo:</b> ${p.tipo === "color" ? "Color" : "Blanco y Negro"}</li>
          <li><b>Precio unitario:</b> $${p.precioUnitario}</li>
          <li><b>Total pérdida:</b> $${p.total.toLocaleString("es-AR")}</li>
        </ul>
        <div style="margin-top:12px;">
          <button class="calc-btn calc-btn-danger" onclick="eliminarPerdidaPorIndice(${idx})">Eliminar</button>
        </div>
      </div>
    `).join("");
  }
  container.style.display = "block";
  container.style.maxHeight = "80vh";
  container.style.overflowY = "auto";
  container.style.minHeight = "500px";
};

function eliminarPerdidaPorIndice(idx) {
  if (!confirm("¿Seguro que deseas eliminar esta pérdida?")) return;
  const perdida = calcRegistroVentas.perdidas[idx];
  if (!perdida) return;
  calcRegistroVentas.totalPerdidas -= perdida.total;
  calcRegistroVentas.perdidas.splice(idx, 1);
  calcGuardarDatos();
  calcActualizarTabla();
  calcMostrarDetalles("perdidas");
}

const oldSyncToFirebase = syncToFirebase;
syncToFirebase = function() {
  if (!isFirebaseEnabled || !database || !currentFotocopiado) {
    return Promise.resolve();
  }
  return areLocalDataValid().then((isValid) => {
    if (!isValid) return calcCargarDatosIniciales();
    return new Promise((resolve, reject) => {
      try {
        const dataToSync = {
          efectivo: calcRegistroVentas.efectivo || 0,
          transferencia: calcRegistroVentas.transferencia || 0,
          ventas: calcRegistroVentas.ventas || [],
          perdidas: calcRegistroVentas.perdidas || [],
          totalPerdidas: calcRegistroVentas.totalPerdidas || 0,
          lastUpdated: Date.now(),
          deviceId: deviceId,
          resetTimestamp: calcRegistroVentas.resetTimestamp || 0,
        };
        const fotocopiadoRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`);
        window.firebaseSet(fotocopiadoRef, dataToSync)
          .then(() => {
            updateSyncStatus("🟢", "Sincronizado");
            calcRegistroVentas.lastUpdated = dataToSync.lastUpdated;
            resolve();
          })
          .catch((error) => {
            updateSyncStatus("🔴", "Error de sincronización");
            reject(error);
          });
      } catch (error) {
        updateSyncStatus("🔴", "Error de sincronización");
        reject(error);
      }
    });
  });
};

const oldCalcCargarDatos = calcCargarDatos;
calcCargarDatos = function() {
  oldCalcCargarDatos();
  if (!calcRegistroVentas.perdidas) calcRegistroVentas.perdidas = [];
  if (!calcRegistroVentas.totalPerdidas) calcRegistroVentas.totalPerdidas = 0;
};

const oldLoadFromFirebase = loadFromFirebase;
loadFromFirebase = function() {
  return new Promise((resolve) => {
    oldLoadFromFirebase().then(() => {
      if (!calcRegistroVentas.perdidas) calcRegistroVentas.perdidas = [];
      if (!calcRegistroVentas.totalPerdidas) calcRegistroVentas.totalPerdidas = 0;
      resolve();
    });
  });
};

const oldListenToFirebaseChanges = listenToFirebaseChanges;
listenToFirebaseChanges = function() {
  if (!isFirebaseEnabled || !database || !currentFotocopiado) return;
  const fotocopiadoRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`);
  window.firebaseOnValue(
    fotocopiadoRef,
    (snapshot) => {
      try {
        if (snapshot.exists()) {
          const data = snapshot.val();
          calcRegistroVentas.efectivo = data.efectivo || 0;
          calcRegistroVentas.transferencia = data.transferencia || 0;
          calcRegistroVentas.ventas = data.ventas || [];
          calcRegistroVentas.perdidas = data.perdidas || [];
          calcRegistroVentas.totalPerdidas = data.totalPerdidas || 0;
          calcRegistroVentas.resetTimestamp = data.resetTimestamp || 0;
          calcRegistroVentas.lastUpdated = data.lastUpdated || 0;
          calcGuardarDatosLocal();
          calcActualizarTabla();
          updateSyncStatus("🔄", "Datos actualizados desde servidor");
        }
      } catch (error) {
        console.error("[v0] Error procesando cambios de Firebase:", error);
      }
    },
    (error) => {
      console.error("[v0] Error escuchando cambios de Firebase:", error);
      updateSyncStatus("🔴", "Error de conexión");
    }
  );
};

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    const btnArchivo = document.querySelector('button[onclick*="calcAgregarArchivo"]');
    if (btnArchivo && !document.getElementById("btnRegistroPerdidas")) {
      const btn = document.createElement("button");
      btn.id = "btnRegistroPerdidas";
      btn.className = "calc-btn calc-btn-warning";
      btn.innerText = "Registro de pérdidas";
      btn.style.marginLeft = "10px";
      btn.onclick = mostrarModalPerdidas;
      btnArchivo.parentNode.appendChild(btn);
    }
  }, 500);
});





// --- Comparar históricos ---

function abrirCompararHistoricos() {
  document.getElementById("modalCompararHistoricos").style.display = "flex";
  document.getElementById("resultadoCompararHistoricos").innerHTML = "";
}

function cerrarModalCompararHistoricos() {
  document.getElementById("modalCompararHistoricos").style.display = "none";
}

async function cargarComparativaHistoricos() {
  const rango = document.getElementById("selectRangoHistorico").value;
  const resultadoDiv = document.getElementById("resultadoCompararHistoricos");
  resultadoDiv.innerHTML = "Cargando...";

  if (!isFirebaseEnabled || !database) {
    resultadoDiv.innerHTML = "Firebase no disponible.";
    return;
  }

  // Calcular fechas de inicio y fin
  const ahora = new Date();
  let fechaInicio, fechaFin = new Date();
  if (rango === "mes") {
    fechaInicio = new Date(fechaFin.getFullYear(), fechaFin.getMonth(), 1);
  } else {
    fechaInicio = new Date();
    fechaInicio.setDate(fechaFin.getDate() - Number(rango));
  }

  // Leer históricos de cada copiado
  const institutos = ["salud", "sociales", "ingenieria"];
  const resumenes = {};

  for (const tipo of institutos) {
    resumenes[tipo] = { ingresos: 0, ventas: 0, perdidas: 0, nombre: calcInstitutos[tipo].name };
    // Buscar en todos los meses posibles del rango
    let meses = [];
    let d = new Date(fechaInicio);
    while (d <= fechaFin) {
      const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!meses.includes(mes)) meses.push(mes);
      d.setMonth(d.getMonth() + 1);
    }
    for (const mes of meses) {
      for (const turno of ["TM", "TT"]) {
        const historicosRef = window.firebaseRef(database, `historicos/${tipo}/${mes}/${turno}`);
        const snap = await window.firebaseGet(historicosRef);
        if (snap.exists()) {
          const historicos = snap.val();
          for (const key in historicos) {
            const h = historicos[key];
            const fechaHist = new Date(h.timestamp || 0);
            if (fechaHist >= fechaInicio && fechaHist <= fechaFin) {
              resumenes[tipo].ingresos += (h.efectivo || 0) + (h.transferencia || 0);
              resumenes[tipo].ventas += (h.ventas ? h.ventas.length : 0);
              resumenes[tipo].perdidas += (h.perdidas ? h.perdidas.length : 0);
            }
          }
        }
      }
    }
  }

  // Mostrar tabla comparativa
  resultadoDiv.innerHTML = `
    <table style="width:100%;margin-top:10px;">
      <thead>
        <tr>
          <th>Copiado</th>
          <th>Ingresos</th>
          <th>Ventas</th>
          <th>Pérdidas</th>
        </tr>
      </thead>
      <tbody>
        ${institutos.map(tipo => `
          <tr>
            <td>${resumenes[tipo].nombre}</td>
            <td>$${resumenes[tipo].ingresos.toLocaleString("es-AR")}</td>
            <td>${resumenes[tipo].ventas}</td>
            <td>${resumenes[tipo].perdidas}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}