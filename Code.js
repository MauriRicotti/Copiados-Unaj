let calcContadorArchivos = 0
let calcArchivos = []
let calcTotal = 0
let calcMetodoPago = null
let calcRegistroVentas = {
  efectivo: 0,
  transferencia: 0,
  ventas: [],
}

let currentFotocopiado = null
let selectedFotocopiado = null

let firebaseApp = null
let database = null
let deviceId = null
let isFirebaseEnabled = false

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
const fotocopiados = {
  salud: {
    name: "Copiados Salud",
    fullName: "Facultad de Ciencias de la Salud",
    password: "salud123",
    icon: "🏥",
  },
  sociales: {
    name: "Copiados Sociales",
    fullName: "Facultad de Ciencias Sociales",
    password: "sociales123",
    icon: "👥",
  },
  ingenieria: {
    name: "Copiados Ingeniería",
    fullName: "Facultad de Ingeniería",
    password: "ingenieria123",
    icon: "⚙️",
  },
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
    console.log("[v0] window.firebase disponible:", typeof window.firebase !== "undefined")

    if (typeof window.firebase !== "undefined") {
      console.log("[v0] Firebase detectado, inicializando...")
      firebaseApp = window.firebase.initializeApp(firebaseConfig)
      database = window.firebase.database()
      isFirebaseEnabled = true
      updateSyncStatus("🟢", "Conectado a Firebase")
      console.log("[v0] Firebase inicializado correctamente")

      const connectedRef = database.ref(".info/connected")
      connectedRef.on("value", (snap) => {
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

function syncToFirebase() {
  if (!isFirebaseEnabled || !database || !currentFotocopiado) {
    console.log("[v0] Firebase no disponible para sincronización")
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    try {
      const dataToSync = {
        efectivo: calcRegistroVentas.efectivo || 0,
        transferencia: calcRegistroVentas.transferencia || 0,
        ventas: calcRegistroVentas.ventas || [],
        lastUpdated: Date.now(),
        deviceId: deviceId,
      }

      console.log("[v0] Sincronizando a Firebase:", dataToSync)
      console.log("[v0] Ruta Firebase:", `fotocopiados/${currentFotocopiado}`)

      database.ref(`fotocopiados/${currentFotocopiado}`).set(dataToSync, (error) => {
        if (error) {
          console.error("[v0] Error sincronizando a Firebase:", error)
          updateSyncStatus("🔴", "Error de sincronización")
          reject(error)
        } else {
          updateSyncStatus("🟢", "Sincronizado")
          console.log("[v0] Datos sincronizados a Firebase correctamente")
          calcRegistroVentas.lastUpdated = dataToSync.lastUpdated
          resolve()
        }
      })
    } catch (error) {
      console.error("[v0] Error sincronizando a Firebase:", error)
      updateSyncStatus("🔴", "Error de sincronización")
      reject(error)
    }
  })
}

function listenToFirebaseChanges() {
  if (!isFirebaseEnabled || !database || !currentFotocopiado) {
    console.log("[v0] Firebase no disponible para escuchar cambios")
    return
  }

  const fotocopiadoRef = database.ref(`fotocopiados/${currentFotocopiado}`)

  fotocopiadoRef.on(
    "value",
    (snapshot) => {
      try {
        const data = snapshot.val()
        console.log("[v0] Cambio detectado en Firebase:", data)

        if (data && data.deviceId !== deviceId) {
          // Solo actualizar si los datos vienen de otro dispositivo
          const newData = {
            efectivo: data.efectivo || 0,
            transferencia: data.transferencia || 0,
            ventas: data.ventas || [],
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
  const savedSession = localStorage.getItem("currentFotocopiado")
  if (savedSession && fotocopiados[savedSession]) {
    currentFotocopiado = savedSession
    showCalculatorScreen()
  } else {
    showLoginScreen()
  }
}

function showLoginScreen() {
  document.getElementById("loginScreen").style.display = "flex"
  document.getElementById("calculatorScreen").style.display = "none"
}

function showCalculatorScreen() {
  document.getElementById("loginScreen").style.display = "none"
  document.getElementById("calculatorScreen").style.display = "block"

  // Actualizar título y subtítulo
  const fotocopiado = fotocopiados[currentFotocopiado]
  document.getElementById("fotocopiadoTitle").textContent = fotocopiado.name
  document.getElementById("fotocopiadoSubtitle").textContent = fotocopiado.fullName

  // Cargar datos específicos del fotocopiado
  loadFromFirebase().then(() => {
    calcAgregarArchivo()
    calcActualizarTabla()
    listenToFirebaseChanges()
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

  if (password === fotocopiados[fotocopiadoType].password) {
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
      database.ref(`fotocopiados/${currentFotocopiado}/ventas`).off()
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

    console.log("[v0] Cargando datos iniciales desde Firebase...")
    updateSyncStatus("🔄", "Cargando datos...")

    const fotocopiadoRef = database.ref(`fotocopiados/${currentFotocopiado}`)

    fotocopiadoRef.once(
      "value",
      (snapshot) => {
        try {
          const firebaseData = snapshot.val()
          console.log("[v0] Datos de Firebase recibidos:", firebaseData)

          if (firebaseData && (firebaseData.ventas || firebaseData.efectivo || firebaseData.transferencia)) {
            // Hay datos en Firebase, usarlos
            calcRegistroVentas = {
              efectivo: firebaseData.efectivo || 0,
              transferencia: firebaseData.transferencia || 0,
              ventas: firebaseData.ventas || [],
            }
            console.log("[v0] Datos cargados desde Firebase:", calcRegistroVentas)
            updateSyncStatus("🟢", "Datos sincronizados desde Firebase")

            // También guardar en localStorage para backup
            calcGuardarDatosLocal()
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
      },
      (error) => {
        console.error("[v0] Error accediendo a Firebase:", error)
        calcCargarDatos() // Fallback a localStorage
        updateSyncStatus("🔴", "Error de conexión")
        resolve()
      },
    )
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

  div.innerHTML = `
        <div class="calc-card-content">
            <div class="calc-flex-between" style="margin-bottom: 24px; align-items: center;">
                <div style="font-size: 1.2rem; font-weight: 600; color: var(--text-heading);">
                    Archivo ${calcContadorArchivos}
                    <button onclick="calcEliminarArchivo(${calcContadorArchivos})" class="calc-btn calc-btn-danger" style="margin-left: 16px; padding: 6px 12px; font-size: 0.9rem;">
                        Eliminar
                    </button>
                </div>
            </div>
            
            <div class="calc-grid calc-grid-cols-5" style="align-items: end;">
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
                
                <div>
                    <label class="calc-label">Tipo de impresión</label>
                    <select id="calcTipo${calcContadorArchivos}" class="calc-select" onchange="calcActualizarSubtotal(${calcContadorArchivos})">
                        <option value="normal">Normal</option>
                        <option value="simple2">Simple faz (2 pág/carilla)</option>
                    </select>
                </div>
                
                <div>
                    <label class="calc-label">Color</label>
                    <select id="calcColor${calcContadorArchivos}" class="calc-select" onchange="calcActualizarSubtotal(${calcContadorArchivos})">
                        <option value="bn">Blanco y Negro</option>
                        <option value="color">Color</option>
                    </select>
                </div>
                
                <div>
                    <div style="text-align: right;">
                        <div style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 4px;" id="calcDesc${calcContadorArchivos}">
                            1 hojas × 1 copias
                        </div>
                        <div class="calc-badge calc-badge-large" id="calcSubtotal${calcContadorArchivos}">
                            $40
                        </div>
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
    tipo: "normal",
    color: "bn",
  })

  calcActualizarSubtotal(calcContadorArchivos)
}

function calcEliminarArchivo(id) {
  if (calcArchivos.length === 1) return

  const elemento = document.getElementById(`calcArchivo${id}`)
  if (elemento) {
    elemento.style.transition = "opacity 0.3s ease"
    elemento.style.opacity = "0"
    setTimeout(() => {
      elemento.remove()
      calcArchivos = calcArchivos.filter((archivo) => archivo.id !== id)
    }, 300)
  }
}

function calcActualizarSubtotal(numeroArchivo) {
  const precioHojaBN = Number.parseFloat(document.getElementById("calcPrecioHoja").value) || 0
  const precioHojaColor = Number.parseFloat(document.getElementById("calcPrecioHojaColor").value) || 0
  const paginas = Number.parseInt(document.getElementById(`calcPaginas${numeroArchivo}`).value) || 0
  const copias = Number.parseInt(document.getElementById(`calcCopias${numeroArchivo}`).value) || 1
  const tipo = document.getElementById(`calcTipo${numeroArchivo}`).value
  const color = document.getElementById(`calcColor${numeroArchivo}`).value

  // Actualizar array de archivos
  const archivoIndex = calcArchivos.findIndex((a) => a.id === numeroArchivo)
  if (archivoIndex !== -1) {
    calcArchivos[archivoIndex] = { id: numeroArchivo, paginas, copias, tipo, color }
  }

  const hojasNecesarias = tipo === "simple2" ? Math.ceil(paginas / 2) : paginas
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

  calcGuardarDatos() // Esto ahora también sincroniza con Firebase inmediatamente
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
  if (confirm("¿Estás seguro de que quieres restablecer todas las ventas del día? Esta acción no se puede deshacer.")) {
    calcRegistroVentas = {
      efectivo: 0,
      transferencia: 0,
      ventas: [],
    }
    calcGuardarDatos() // Esto también sincronizará el reset con Firebase
    calcActualizarTabla()
    calcOcultarDetalles()
    alert("Todas las ventas han sido restablecidas.")
  }
}

function calcCambiarMetodoPago(ventaId, nuevoMetodo) {
  const venta = calcRegistroVentas.ventas.find((v) => v.id === ventaId)
  if (!venta) return

  const metodoAnterior = venta.metodoPago
  const montoVenta = venta.total

  // Actualizar totales
  if (metodoAnterior === "efectivo") {
    calcRegistroVentas.efectivo -= montoVenta
  } else {
    calcRegistroVentas.transferencia -= montoVenta
  }

  if (nuevoMetodo === "efectivo") {
    calcRegistroVentas.efectivo += montoVenta
  } else {
    calcRegistroVentas.transferencia += montoVenta
  }

  // Actualizar venta
  venta.metodoPago = nuevoMetodo

  calcGuardarDatos() // Esto también sincronizará el cambio con Firebase
  calcActualizarTabla()

  // Actualizar vista de detalles si está abierta
  const detallesContainer = document.getElementById("calcDetallesContainer")
  if (detallesContainer.style.display !== "none") {
    calcOcultarDetalles()
  }
}

function calcActualizarTabla() {
  const ventasEfectivo = calcRegistroVentas.ventas.filter((v) => v.metodoPago === "efectivo")
  const ventasTransferencia = calcRegistroVentas.ventas.filter((v) => v.metodoPago === "transferencia")

  // Desktop
  document.getElementById("calcTotalEfectivo").textContent = `$${calcRegistroVentas.efectivo.toLocaleString()}`
  document.getElementById("calcTotalTransferencia").textContent =
    `$${calcRegistroVentas.transferencia.toLocaleString()}`
  document.getElementById("calcTotalGeneral").textContent =
    `$${(calcRegistroVentas.efectivo + calcRegistroVentas.transferencia).toLocaleString()}`
  document.getElementById("calcCountEfectivo").textContent = ventasEfectivo.length
  document.getElementById("calcCountTransferencia").textContent = ventasTransferencia.length
  document.getElementById("calcTotalVentas").textContent = `${calcRegistroVentas.ventas.length} ventas`

  // Mobile
  document.getElementById("calcTotalEfectivoMobile").textContent = `$${calcRegistroVentas.efectivo.toLocaleString()}`
  document.getElementById("calcTotalTransferenciaMobile").textContent =
    `$${calcRegistroVentas.transferencia.toLocaleString()}`
  document.getElementById("calcTotalGeneralMobile").textContent =
    `$${(calcRegistroVentas.efectivo + calcRegistroVentas.transferencia).toLocaleString()}`
  document.getElementById("calcCountEfectivoMobile").textContent = ventasEfectivo.length
  document.getElementById("calcCountTransferenciaMobile").textContent = ventasTransferencia.length
  document.getElementById("calcTotalVentasMobile").textContent = `${calcRegistroVentas.ventas.length} ventas`
}

function calcMostrarDetalles(metodo) {
  const ventas = calcRegistroVentas.ventas.filter((v) => v.metodoPago === metodo)
  const container = document.getElementById("calcDetallesContainer")
  const content = document.getElementById("calcDetallesContent")
  const title = document.getElementById("calcDetallesTitle")

  title.textContent = `Detalles de Ventas - ${metodo === "efectivo" ? "Efectivo" : "Transferencia"}`

  if (ventas.length === 0) {
    content.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                No hay ventas registradas para este método de pago.
            </div>
        `
  } else {
    content.innerHTML = ventas
      .map(
        (venta) => `
            <div class="calc-venta-item">
                <div class="calc-flex-between" style="margin-bottom: 12px;">
                    <div>
                        <span style="font-size: 1.2rem; font-weight: 600;">$${venta.total}</span>
                        <span style="font-size: 0.9rem; color: var(--text-secondary); margin-left: 12px;">
                            ${venta.fecha} - ${venta.hora}
                        </span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div class="calc-badge">B/N: $${venta.precioHojaBN || venta.precioHoja || 40}</div>
                        <div class="calc-badge">Color: $${venta.precioHojaColor || 80}</div>
                        <button onclick="if(confirm('¿Cambiar método de pago a ${venta.metodoPago === "efectivo" ? "transferencia" : "efectivo"}?')) calcCambiarMetodoPago('${venta.id}', '${venta.metodoPago === "efectivo" ? "transferencia" : "efectivo"}')" class="calc-btn calc-btn-outline" style="padding: 4px 8px; font-size: 0.8rem;">
                            Cambiar
                        </button>
                    </div>
                </div>
                <div style="font-size: 0.9rem; color: var(--text-secondary);">
                    <strong>Archivos:</strong>
                    <ul style="margin-top: 8px; margin-left: 20px;">
                        ${venta.archivos
                          .map((archivo) => {
                            const hojas = archivo.tipo === "simple2" ? Math.ceil(archivo.paginas / 2) : archivo.paginas
                            const tipoLabel = archivo.tipo === "simple2" ? "Simple faz (2 pág/carilla)" : "Normal"
                            const colorLabel = archivo.color === "color" ? "Color" : "B/N"
                            const precioUsado =
                              archivo.color === "color"
                                ? venta.precioHojaColor || 80
                                : venta.precioHojaBN || venta.precioHoja || 40
                            return `<li style="margin-bottom: 4px;">• ${archivo.paginas} páginas × ${archivo.copias} copias (${tipoLabel} - ${colorLabel}) = $${hojas * precioUsado * archivo.copias}</li>`
                          })
                          .join("")}
                    </ul>
                </div>
            </div>
        `,
      )
      .join("")
  }

  container.style.display = "block"
  container.scrollIntoView({ behavior: "smooth" })
}

function calcOcultarDetalles() {
  document.getElementById("calcDetallesContainer").style.display = "none"
}

function calcExportarExcel() {
  const ventasEfectivo = calcRegistroVentas.ventas.filter((v) => v.metodoPago === "efectivo")
  const ventasTransferencia = calcRegistroVentas.ventas.filter((v) => v.metodoPago === "transferencia")

  let csvContent = "data:text/csv;charset=utf-8,"
  csvContent += "REPORTE DE VENTAS DEL DÍA\n\n"

  // Resumen
  csvContent += "RESUMEN\n"
  csvContent += "Método de Pago,Total Acumulado\n"
  csvContent += `Efectivo,$${calcRegistroVentas.efectivo}\n`
  csvContent += `Transferencia,$${calcRegistroVentas.transferencia}\n`
  csvContent += `Total General,$${calcRegistroVentas.efectivo + calcRegistroVentas.transferencia}\n\n`

  // Detalles de efectivo
  if (ventasEfectivo.length > 0) {
    csvContent += "VENTAS EN EFECTIVO\n"
    csvContent += "Fecha,Hora,Total,Archivos,Precio B/N,Precio Color\n"
    ventasEfectivo.forEach((venta) => {
      const archivosDesc = venta.archivos
        .map((a) => `${a.paginas}pág-${a.copias}cop-${a.tipo}-${a.color || "bn"}`)
        .join(";")
      csvContent += `${venta.fecha},${venta.hora},$${venta.total},"${archivosDesc}",$${venta.precioHojaBN || venta.precioHoja || 40},$${venta.precioHojaColor || 80}\n`
    })
    csvContent += "\n"
  }

  // Detalles de transferencia
  if (ventasTransferencia.length > 0) {
    csvContent += "VENTAS POR TRANSFERENCIA\n"
    csvContent += "Fecha,Hora,Total,Archivos,Precio B/N,Precio Color\n"
    ventasTransferencia.forEach((venta) => {
      const archivosDesc = venta.archivos
        .map((a) => `${a.paginas}pág-${a.copias}cop-${a.tipo}-${a.color || "bn"}`)
        .join(";")
      csvContent += `${venta.fecha},${venta.hora},$${venta.total},"${archivosDesc}",$${venta.precioHojaBN || venta.precioHoja || 40},$${venta.precioHojaColor || 40}\n`
    })
  }

  const encodedUri = encodeURI(csvContent)
  const link = document.createElement("a")
  link.setAttribute("href", encodedUri)
  link.setAttribute("download", `ventas_${new Date().toLocaleDateString("es-ES").replace(/\//g, "-")}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
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
