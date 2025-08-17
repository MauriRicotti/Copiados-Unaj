// Configuración de Firebase - REEMPLAZAR CON TUS CREDENCIALES
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

// Configuración de fotocopiados
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

// Variables globales
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

// Variables para la comparativa
const comparativaCharts = {
  ingresos: null,
  metodos: null,
}

// Funciones de tema
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
    return true // Si no hay Firebase, usar datos locales
  }

  return new Promise((resolve) => {
    const fotocopiadoRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`)

    window
      .firebaseGet(fotocopiadoRef)
      .then((snapshot) => {
        const firebaseData = snapshot.val()
        if (!firebaseData) {
          resolve(true) // No hay datos en Firebase, los locales son válidos
          return
        }

        const localResetTimestamp = calcRegistroVentas.resetTimestamp || 0
        const firebaseResetTimestamp = firebaseData.resetTimestamp || 0

        // Si el reset de Firebase es más reciente, los datos locales son inválidos
        resolve(firebaseResetTimestamp <= localResetTimestamp)
      })
      .catch(() => {
        resolve(true) // En caso de error, asumir que los datos locales son válidos
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
      // Recargar datos desde Firebase en lugar de sincronizar datos obsoletos
      return calcCargarDatosIniciales()
    }

    return new Promise((resolve, reject) => {
      try {
        const dataToSync = {
          efectivo: calcRegistroVentas.efectivo || 0,
          transferencia: calcRegistroVentas.transferencia || 0,
          ventas: calcRegistroVentas.ventas || [],
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
                resetTimestamp: firebaseResetTimestamp,
              }
              calcGuardarDatosLocal() // Actualizar localStorage con datos válidos
            } else {
              // Usar datos de Firebase normalmente
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
            // No hay datos en Firebase, cargar desde localStorage
            console.log("[v0] No hay datos en Firebase, cargando desde localStorage")
            calcCargarDatos()

            // Si hay datos en localStorage, sincronizarlos a Firebase
            if (calcRegistroVentas.ventas.length > 0) {
              console.log("[v0] Sincronizando datos locales a Firebase")
              syncToFirebase()
            }
          }
          resolve()
        } catch (error) {
          console.error("[v0] Error cargando desde Firebase:", error)
          calcCargarDatos() // Fallback a localStorage
          updateSyncStatus("🔴", "Error cargando datos")
          resolve()
        }
      })
      .catch((error) => {
        console.error("[v0] Error accediendo a Firebase:", error)
        calcCargarDatos() // Fallback a localStorage
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
                        class="calc-input" onchange="calcActualizarSubtotal(${calcContadorArchivos})">
                </div>
                <div>
                    <label class="calc-label">Copias</label>
                    <input type="number" id="calcCopias${calcContadorArchivos}" value="1" min="1"
                        class="calc-input" onchange="calcActualizarSubtotal(${calcContadorArchivos})">
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
    tipo: "1", // Por defecto 1 pág/carilla
    color: "bn",
  })

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
      // Mantener el botón eliminar pero actualizar el texto
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

  // Validación de páginas
  if (paginas <= 0) {
    const descElement = document.getElementById(`calcDesc${numeroArchivo}`)
    const subtotalElement = document.getElementById(`calcSubtotal${numeroArchivo}`)
    if (descElement && subtotalElement) {
      descElement.textContent = "Error: Debe ingresar más de 0 páginas."
      subtotalElement.textContent = "$0"
    }
    return
  }

  // Actualizar array de archivos
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
    subtotalElement.textContent = `$${subtotal}`
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
    const hojasNecesarias = archivo.tipo === "simple2" ? Math.ceil(archivo.paginas / 2) : archivo.paginas
    const precioHoja = archivo.color === "color" ? precioHojaColor : precioHojaBN
    totalCalculado += hojasNecesarias * precioHoja * archivo.copias
  })

  calcTotal = totalCalculado
  document.getElementById("calcTotalDisplay").textContent = `Total a cobrar: $${calcTotal}`
  document.getElementById("calcPagoContainer").style.display = "block"

  // Reset payment section
  calcMetodoPago = null
  document.getElementById("calcEfectivo").checked = false
  document.getElementById("calcTransferencia").checked = false
  document.getElementById("calcDineroCliente").value = ""
  document.getElementById("calcResultadoCambio").style.display = "none"
  document.getElementById("calcBtnFinalizar").disabled = true

  // Scroll to payment section
  document.getElementById("calcPagoContainer").scrollIntoView({ behavior: "smooth" })
}

function calcCancelarVenta() {
  if (confirm("¿Estás seguro de que quieres cancelar la venta actual? Se perderán todos los archivos agregados.")) {
    // Limpiar container de archivos
    document.getElementById("calcArchivosContainer").innerHTML = ""

    // Ocultar sección de pago si está visible
    document.getElementById("calcPagoContainer").style.display = "none"

    // Reset variables
    calcArchivos = []
    calcContadorArchivos = 0
    calcTotal = 0
    calcMetodoPago = null

    calcAgregarArchivo()

    // Scroll al inicio
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
    alert("Por favor selecciona un método de pago.")
    return
  }

  const ahora = new Date()
  const ventaDetalle = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    fecha: ahora.toLocaleDateString("es-ES"),
    hora: ahora.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
    total: calcTotal,
    metodoPago: calcMetodoPago,
    archivos: [...calcArchivos],
    precioHojaBN: Number.parseFloat(document.getElementById("calcPrecioHoja").value),
    precioHojaColor: Number.parseFloat(document.getElementById("calcPrecioHojaColor").value),
    deviceId: deviceId,
    timestamp: Date.now(),
  }

  console.log("[v0] Finalizando venta:", ventaDetalle)

  // Actualizar registro
  if (calcMetodoPago === "efectivo") {
    calcRegistroVentas.efectivo += calcTotal
  } else {
    calcRegistroVentas.transferencia += calcTotal
  }
  calcRegistroVentas.ventas.push(ventaDetalle)

  console.log("[v0] Registro actualizado:", calcRegistroVentas)

  calcGuardarDatos()
  calcActualizarTabla()

  // Reset everything immediately
  document.getElementById("calcArchivosContainer").innerHTML = ""
  document.getElementById("calcPagoContainer").style.display = "none"

  calcArchivos = []
  calcContadorArchivos = 0
  calcTotal = 0
  calcMetodoPago = null

  calcAgregarArchivo()
  window.scrollTo({ top: 0, behavior: "smooth" })
}

function calcRestablecerVentas() {
  // Primero pedir la contraseña
  const password = prompt("Ingresa la contraseña de administrador para restablecer las ventas:")

  // Verificar si se canceló o no se ingresó contraseña
  if (password === null || password === "") {
    return // Salir si se canceló o no se ingresó nada
  }

  // Verificar la contraseña (puedes cambiar "admin123" por la contraseña que prefieras)
  if (password !== "admin123") {
    alert("Contraseña incorrecta. No se puede restablecer el registro de ventas.")
    return
  }

  // Si la contraseña es correcta, proceder con la confirmación original
  if (confirm("¿Estás seguro de que deseas restablecer todas las ventas del día?")) {
    const resetTimestamp = Date.now()

    calcRegistroVentas = {
      efectivo: 0,
      transferencia: 0,
      ventas: [],
      resetTimestamp: resetTimestamp,
      isReset: true, // Flag adicional para identificar resets
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

// Restablecer ventas con backup en Firebase
async function calcRestablecerVentas() {
  const password = prompt("Ingresa la contraseña de administrador para restablecer las ventas:");
  if (password === null || password === "") return;
  if (password !== "admin123") {
    alert("Contraseña incorrecta. No se puede restablecer el registro de ventas.");
    return;
  }

  // Backup antes de borrar
  if (isFirebaseEnabled && database && currentFotocopiado) {
    try {
      const ventasRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`);
      const backupRef = window.firebaseRef(database, `backups/${currentFotocopiado}/${Date.now()}`);
      const snapshot = await window.firebaseGet(ventasRef);
      if (snapshot.exists()) {
        await window.firebaseSet(backupRef, snapshot.val());
      }
    } catch (error) {
      console.error("Error guardando backup en Firebase:", error);
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

// Recuperar el último backup desde Firebase
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
      // Restaurar ventas en Firebase y local
      const ventasRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`);
      await window.firebaseSet(ventasRef, ultimoBackup);
      calcRegistroVentas = {
        efectivo: ultimoBackup.efectivo || 0,
        transferencia: ultimoBackup.transferencia || 0,
        ventas: ultimoBackup.ventas || [],
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

// Funciones para la comparativa entre institutos
async function calcMostrarComparativa() {
  document.getElementById("calculatorScreen").style.display = "none"
  document.getElementById("calcComparativaScreen").style.display = "block"

  // Sincronizar tema
  const themeTextComp = document.getElementById("themeTextComp")
  const currentTheme = document.documentElement.getAttribute("data-theme")
  if (themeTextComp) {
    themeTextComp.textContent = currentTheme === "dark" ? "☀️ Claro" : "🌙 Oscuro"
  }

  await calcCargarDatosComparativa()
}

function calcVolverDesdeComparativa() {
  document.getElementById("calcComparativaScreen").style.display = "none"
  document.getElementById("calculatorScreen").style.display = "block"
}

async function calcCargarDatosComparativa() {
  if (!isFirebaseEnabled || !database) {
    alert("Firebase no está disponible. No se pueden cargar los datos de comparativa.")
    return
  }

  try {
    const institutos = ["salud", "sociales", "ingenieria"]
    const datosInstitutos = {}

    // Cargar datos de todos los institutos
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
      }
    }

    calcMostrarDatosComparativa(datosInstitutos)
  } catch (error) {
    console.error("Error cargando datos de comparativa:", error)
    alert("Error al cargar los datos de comparativa")
  }
}

function calcMostrarDatosComparativa(datos) {
  // Calcular totales generales
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

  // Actualizar cards de resumen con IDs correctos
  document.getElementById("calcTotalGeneralComp").textContent = `$${totalGeneral.toLocaleString()}`
  document.getElementById("calcInstitutoLider").textContent = institutoLider || "Sin datos"
  document.getElementById("calcVentasTotales").textContent = ventasTotales

  // Crear gráficos
  calcCrearGraficoIngresos(datos)
  calcCrearGraficoMetodos(datos)

  // Mostrar detalles
  calcMostrarDetallesComparativa(datos)
}

function calcCrearGraficoIngresos(datos) {
  const ctx = document.getElementById("calcChartIngresos").getContext("2d")

  // Destruir gráfico anterior si existe
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
            "rgba(34, 197, 94, 0.8)", // Verde para Salud
            "rgba(59, 130, 246, 0.8)", // Azul para Sociales
            "rgba(239, 68, 68, 0.8)", // Rojo para Ingeniería
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

  // Destruir gráfico anterior si existe
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
                <span>$${instituto.total.toLocaleString()}</span>
            </div>
            <div class="calc-detail-stat">
                <span>Ventas en Efectivo:</span>
                <span>$${instituto.efectivo.toLocaleString()}</span>
            </div>
            <div class="calc-detail-stat">
                <span>Ventas por Transferencia:</span>
                <span>$${instituto.transferencia.toLocaleString()}</span>
            </div>
            <div class="calc-detail-stat">
                <span>Número de Ventas:</span>
                <span>${instituto.ventas.length}</span>
            </div>
            <div class="calc-detail-stat">
                <span>Promedio por Venta:</span>
                <span>$${instituto.ventas.length > 0 ? Math.round(instituto.total / instituto.ventas.length).toLocaleString() : 0}</span>
            </div>
        `

    grid.appendChild(card)
  })
}

async function calcActualizarComparativa() {
  await calcCargarDatosComparativa()
}

// Actualizar subtotales cuando cambien los precios
document.addEventListener("change", (e) => {
  if (e.target.id === "calcPrecioHoja" || e.target.id === "calcPrecioHojaColor") {
    calcArchivos.forEach((archivo) => {
      calcActualizarSubtotal(archivo.id)
    })
  }
})

document.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    // Buscar si el elemento activo es un input de contraseña
    const activeElement = document.activeElement
    if (activeElement && activeElement.id && activeElement.id.startsWith("passwordInput-")) {
      const tipo = activeElement.id.replace("passwordInput-", "")
      login(tipo)
    }
  }
})

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
        const data = snapshot.val()
        console.log("[v0] Cambio detectado en Firebase:", data)

        if (data && data.deviceId !== deviceId) {
          const localResetTimestamp = calcRegistroVentas.resetTimestamp || 0
          const firebaseResetTimestamp = data.resetTimestamp || 0

          if (data.isReset || firebaseResetTimestamp > localResetTimestamp) {
            console.log("[v0] Reset detectado desde otro dispositivo, invalidando datos locales")
            calcRegistroVentas = {
              efectivo: data.efectivo || 0,
              transferencia: data.transferencia || 0,
              ventas: data.ventas || [],
              resetTimestamp: firebaseResetTimestamp,
            }
            calcGuardarDatosLocal() // Actualizar localStorage
            calcActualizarTabla()
            updateSyncStatus("🔄", "Datos restablecidos desde otro dispositivo")
            showSyncNotification("Las ventas fueron restablecidas desde otro dispositivo")
            return
          }

          // Solo actualizar si los datos vienen de otro dispositivo y son más recientes
          const newData = {
            efectivo: data.efectivo || 0,
            transferencia: data.transferencia || 0,
            ventas: data.ventas || [],
            resetTimestamp: firebaseResetTimestamp,
          }

          const currentTimestamp = calcRegistroVentas.lastUpdated || 0
          const newTimestamp = data.lastUpdated || 0

          if (newTimestamp > currentTimestamp) {
            console.log("[v0] Actualizando datos desde otro dispositivo")
            calcRegistroVentas = newData
            calcRegistroVentas.lastUpdated = newTimestamp
            calcGuardarDatosLocal() // Guardar también en localStorage
            calcActualizarTabla()
            updateSyncStatus("🔄", "Datos actualizados desde otro dispositivo")

            // Mostrar notificación visual
            showSyncNotification("Datos actualizados desde otro dispositivo")
          }
        }
      } catch (error) {
        console.error("[v0] Error procesando datos de Firebase:", error)
      }
    },
    (error) => {
      console.error("[v0] Error escuchando cambios de Firebase:", error)
      updateSyncStatus("🔴", "Error de conexión")
    },
  )
}

function showSyncNotification(message) {
  // Crear notificación temporal
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

  // Agregar animación CSS
  const style = document.createElement("style")
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `
  document.head.appendChild(style)

  document.body.appendChild(notification)

  // Remover después de 3 segundos
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
    // Solo aplicar en la pantalla de login
    const loginScreen = document.getElementById("loginScreen")
    if (!loginScreen || loginScreen.style.display === "none") return

    // Verificar si el clic fue fuera de las tarjetas de fotocopiado
    const clickedCard = event.target.closest(".fotocopiado-card")
    const clickedPasswordSection = event.target.closest(".password-section-inline")

    // Si no se hizo clic en una tarjeta ni en una sección de contraseña, deseleccionar
    if (!clickedCard && !clickedPasswordSection) {
      cancelLogin()
    }
  })
}

function checkExistingSession() {
  // Clear any existing session to ensure fresh data sync
  localStorage.removeItem("currentFotocopiado")
  currentFotocopiado = null
  showLoginScreen()
}

function showLoginScreen() {
  document.getElementById("loginScreen").style.display = "flex"
  document.getElementById("calculatorScreen").style.display = "none"
}

function showCalculatorScreen() {
  document.getElementById("loginScreen").style.display = "none"
  document.getElementById("calculatorScreen").style.display = "block"

  // Actualizar título y subtítulo
  const fotocopiado = calcInstitutos[currentFotocopiado]
  document.getElementById("fotocopiadoTitle").textContent = fotocopiado.name
  document.getElementById("fotocopiadoSubtitle").textContent = fotocopiado.fullName

  showSyncNotification("Cargando datos más recientes del servidor...")

  // Cargar datos específicos del fotocopiado
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
    showCalculatorScreen()
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
    // Remover selección de la tarjeta específica
    document.querySelectorAll(".fotocopiado-card").forEach((card) => {
      if (card.onclick.toString().includes(tipo)) {
        card.classList.remove("selected")
      }
    })
  } else {
    // Comportamiento original para compatibilidad
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
          calcCargarDatos() // Fallback a localStorage solo en caso de error
          updateSyncStatus("🔴", "Error cargando datos")
          resolve()
        }
      })
      .catch((error) => {
        console.error("[v0] Error accediendo a Firebase:", error)
        calcCargarDatos() // Fallback a localStorage solo in case of error
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

  // Obtener ventas por método
  const ventasEfectivo = (calcRegistroVentas.ventas || []).filter(v => v.metodoPago === "efectivo").map(v => v.total)
  const ventasTransferencia = (calcRegistroVentas.ventas || []).filter(v => v.metodoPago === "transferencia").map(v => v.total)
  const maxFilas = Math.max(ventasEfectivo.length, ventasTransferencia.length, 1) // Siempre al menos una fila

  // Construir filas de ventas
  const filasVentas = []
  for (let i = 0; i < maxFilas; i++) {
    filasVentas.push([
      ventasEfectivo[i] !== undefined ? `$${ventasEfectivo[i]}` : "",
      ventasTransferencia[i] !== undefined ? `$${ventasTransferencia[i]}` : ""
    ])
  }

  // Totales
  const totalEfectivo = ventasEfectivo.reduce((a, b) => a + (parseFloat(b) || 0), 0)
  const totalTransferencia = ventasTransferencia.reduce((a, b) => a + (parseFloat(b) || 0), 0)
  const totalGeneral = totalEfectivo + totalTransferencia

  // Estructura final
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

  // Crear hoja y libro
  const ws = XLSX.utils.aoa_to_sheet(datos)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Ventas")

  // Nombre de archivo
  const nombreArchivo = `${nombreCopiado.replace(/\s/g, "_")}_${mes}_${año}.xlsx`
  XLSX.writeFile(wb, nombreArchivo)
}

function calcExportarPDF() {
  // Datos principales
  const ahora = new Date();
  const mes = ahora.toLocaleString("es-ES", { month: "long" });
  const año = ahora.getFullYear();
  const nombreCopiado = calcInstitutos[currentFotocopiado]?.name || "Copiado";

  // Obtener ventas
  const ventas = calcRegistroVentas.ventas || [];
  const totalEfectivo = ventas.filter(v => v.metodoPago === 'efectivo').reduce((acc, v) => acc + v.total, 0);
  const totalTransferencia = ventas.filter(v => v.metodoPago === 'transferencia').reduce((acc, v) => acc + v.total, 0);
  const totalGeneral = totalEfectivo + totalTransferencia;

  // Crear PDF
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(`Registro de Ventas - ${nombreCopiado}`, 14, 18);
  doc.setFontSize(12);
  doc.text(`Mes: ${mes.charAt(0).toUpperCase() + mes.slice(1)} ${año}`, 14, 26);

  // Preparar datos para la tabla principal
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

  let y = 36;
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

  // Tabla de totales
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

  // Guardar PDF
  doc.save(`RegistroVentas_${nombreCopiado}_${mes}_${año}.pdf`);
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

  // Resumen general desde DOM
  const totalGeneral = document.getElementById("calcTotalGeneralComp")?.textContent || "$0"
  const institutoLider = document.getElementById("calcInstitutoLider")?.textContent || "-"
  const ventasTotales = document.getElementById("calcVentasTotales")?.textContent || "0"

  doc.text(`Total General: ${totalGeneral}`, 14, 42)
  doc.text(`Instituto Líder: ${institutoLider}`, 14, 50)
  doc.text(`Ventas Totales: ${ventasTotales}`, 14, 58)

  // Detalles por instituto desde DOM
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

  // Graficos: capturar canvas y agregar como imagen
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

function calcActualizarTabla() {
  // Actualizar totales
  document.getElementById("calcTotalEfectivo").textContent = `$${calcRegistroVentas.efectivo || 0}`;
  document.getElementById("calcTotalTransferencia").textContent = `$${calcRegistroVentas.transferencia || 0}`;
  document.getElementById("calcTotalGeneral").textContent = `$${(calcRegistroVentas.efectivo + calcRegistroVentas.transferencia) || 0}`;
  document.getElementById("calcCountEfectivo").textContent = (calcRegistroVentas.ventas || []).filter(v => v.metodoPago === "efectivo").length;
  document.getElementById("calcCountTransferencia").textContent = (calcRegistroVentas.ventas || []).filter(v => v.metodoPago === "transferencia").length;
  document.getElementById("calcTotalVentas").textContent = `${(calcRegistroVentas.ventas || []).length} ventas`;

  // Actualizar versión móvil
  document.getElementById("calcTotalEfectivoMobile").textContent = `$${calcRegistroVentas.efectivo || 0}`;
  document.getElementById("calcTotalTransferenciaMobile").textContent = `$${calcRegistroVentas.transferencia || 0}`;
  document.getElementById("calcTotalGeneralMobile").textContent = `$${(calcRegistroVentas.efectivo + calcRegistroVentas.transferencia) || 0}`;
  document.getElementById("calcCountEfectivoMobile").textContent = (calcRegistroVentas.ventas || []).filter(v => v.metodoPago === "efectivo").length;
  document.getElementById("calcCountTransferenciaMobile").textContent = (calcRegistroVentas.ventas || []).filter(v => v.metodoPago === "transferencia").length;
  document.getElementById("calcTotalVentasMobile").textContent = `${(calcRegistroVentas.ventas || []).length} ventas`;
}