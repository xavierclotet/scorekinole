---
route: "/admin/tools/backup"
title: "Firestore Backup & Restore (SuperAdmin)"
description: "Herramienta de backup/restore de colecciones Firestore. Export a JSON, import desde archivo, restore selectivo por coleccion/documento."
---

## Contexto de Agente (WebMCP)
> **ATENCION IA / AGENTE**: Herramienta de administracion para backup completo de Firestore.
> Solo accesible para SuperAdmin (usa `SuperAdminGuard`).
> Interfaz con dos tabs: Export y Import/Restore.

## Estructura y Componentes Principales
- **Tabs**: Export | Import & Restore
- **Export Tab**:
  - Checkboxes por coleccion (tournaments, users, matches, venues, matchInvites, pageViews, pageViewStats)
  - "Select All" checkbox
  - Preview con `JsonTreeNode` (arbol JSON expandible)
  - Boton export → descarga archivo JSON
  - Banner de exito con conteo de documentos
- **Import Tab**:
  - Upload de archivo JSON (estilo drag-and-drop)
  - Metadata del backup (fecha, documentos, colecciones)
  - Arbol JSON con documentos seleccionables por coleccion
  - Botones de restore por coleccion
  - Dialogo de progreso con barra de progreso
- **Banners**: Exito/error para cada operacion

## Estados Clave
| Variable | Tipo | Descripcion |
| :--- | :--- | :--- |
| `activeTab` | `'export' \| 'import'` | Tab activo |
| `selectedCollections` | `Set<string>` | Colecciones seleccionadas para export |
| `previewData` | `Record<string, any>` | Datos previsualizados del export |
| `importedData` | `BackupData \| null` | Datos importados del archivo JSON |
| `isExporting` / `isRestoring` | `boolean` | Estado de operacion en curso |
| `restoreProgress` | `{ current, total, collection }` | Progreso de restore |

## Firebase
- `exportCollections(collectionNames)` - Exporta colecciones seleccionadas
- `restoreDocuments(collection, documents, onProgress)` - Restaura documentos con batched writes (500 docs/batch)
- `downloadJson(data, filename)` - Descarga JSON como archivo

## Notas Importantes
- El restore usa batched writes con limite de 500 documentos por batch (limite Firestore).
- Los Timestamps de Firestore se serializan/deserializan correctamente.
- No hay undo — el restore sobreescribe documentos existentes.
- `JsonTreeNode` es un componente recursivo para visualizar JSON anidado.
