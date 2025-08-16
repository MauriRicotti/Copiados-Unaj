// ... existing code ...

document.addEventListener("DOMContentLoaded", () => {
  calcCargarTema()
  generateDeviceId()
  checkExistingSession()
  addOutsideClickListener()
  // <CHANGE> Retrasar la inicialización de Firebase para asegurar que se cargue
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

      // <CHANGE> Verificar conexión a Firebase
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
      // <CHANGE> Reintentar carga de Firebase
      setTimeout(initializeFirebase, 2000)
    }
  } catch (error) {
    console.error("[v0] Error inicializando Firebase:", error)
    isFirebaseEnabled = false
    updateSyncStatus("🔴", "Error de conexión")
    // <CHANGE> Reintentar en caso de error
    setTimeout(initializeFirebase, 3000)
  }
}

// ... existing code ...

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

      // <CHANGE> Usar set con callback para mejor manejo de errores
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

  // <CHANGE> Cambiar ruta para escuchar cambios en el nodo principal del fotocopiado
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

// ... existing code ...

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

    // <CHANGE> Cambiar ruta para cargar desde el nodo principal del fotocopiado
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
      }
    );
  });
}