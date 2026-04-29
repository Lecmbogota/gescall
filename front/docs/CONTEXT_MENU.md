# Sistema de Menú Contextual

## Descripción

El sistema de menú contextual implementa una interfaz limpia tipo macOS donde todas las acciones están disponibles mediante clic derecho, eliminando botones visibles innecesarios.

## Componentes Implementados

### 1. Dashboard (`/components/Dashboard.tsx`)

**Menú contextual general** (clic derecho en cualquier parte):
- ✅ Activar/Desactivar Edición
- ✅ Marketplace de Widgets
- ✅ Restaurar Layout
- ✅ Restablecer Widgets

**Menú contextual por widget** (clic derecho en widget, solo en modo edición):
- ✅ Configurar Widget
- ✅ Desactivar Widget

### 2. Campañas (`/components/Campaigns.tsx`)

**Menú contextual general** (clic derecho en cualquier parte):
- ✅ Nueva Campaña
- ✅ Actualizar Lista
- ✅ Exportar Datos
- ✅ Importar Campaña
- ✅ Ver Archivadas
- ✅ Configuración
- ✅ Reportes Avanzados

**Menú contextual por campaña** (todas las vistas):
- ✅ Ver Detalles
- ✅ Pausar/Reanudar Campaña
- ✅ Editar Campaña
- ✅ Duplicar Campaña
- ✅ Configuración
- ✅ Ver Reportes
- ✅ Exportar Datos
- ✅ Importar Leads
- ✅ Archivar
- ✅ Eliminar (danger/rojo)

## Vistas de Campaña con Menú Contextual

1. **Vista Grid** - `CampaignCard.tsx`
2. **Vista Lista** - `CampaignListView.tsx`
3. **Vista Compacta** - `CampaignCompactView.tsx`
4. **Vista Inmersiva** - `CampaignImmersiveView.tsx`

## Uso del Componente

```tsx
import { ContextMenu } from './ContextMenu';
import { toast } from 'sonner@2.0.3';

const menuItems = [
  {
    label: "Acción Principal",
    icon: <Icon className="w-4 h-4" />,
    action: () => {
      toast.success("Acción ejecutada");
    },
  },
  {
    label: "Acción Secundaria",
    icon: <Icon className="w-4 h-4" />,
    action: () => {
      toast.info("Información");
    },
    separator: true, // Agrega separador antes
  },
  {
    label: "Eliminar",
    icon: <Trash2 className="w-4 h-4" />,
    action: () => {
      toast.error("Elemento eliminado");
    },
    variant: "danger", // Color rojo para acciones peligrosas
  },
];

// En el JSX
<ContextMenu items={menuItems}>
  <div>Tu contenido aquí</div>
</ContextMenu>
```

## Características

- ✅ Diseño glassmorphism
- ✅ Animaciones suaves tipo macOS
- ✅ Soporte para íconos
- ✅ Separadores entre grupos
- ✅ Variante "danger" para acciones destructivas
- ✅ Notificaciones toast integradas
- ✅ Z-index alto para evitar conflictos
- ✅ Submenús (opcional)

## Notas Técnicas

- Usa `@radix-ui/react-context-menu@2.2.6`
- Usa `sonner@2.0.3` para notificaciones
- El componente usa `asChild` en el trigger para mejor composición
- Los widgets solo muestran menú contextual en modo edición para evitar anidamiento
- Todos los eventos de toast están implementados como placeholders funcionales

## Estilos

Los estilos están en `/styles/globals.css`:
- Animación de entrada `slideIn`
- Transiciones suaves
- Z-index de 9999 para el contenido del menú
