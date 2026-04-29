import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { toast } from 'sonner';
import { User, Mail, Phone, Building, Save, Edit2 } from 'lucide-react';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
}

export function UserProfileModal({ isOpen, onClose, username }: UserProfileModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    fullName: username === 'desarrollo' ? 'Equipo Desarrollo' : 'Usuario Administrador',
    email: username === 'desarrollo' ? 'dev@gescall.com' : `${username}@gescall.com`,
    phone: '+52 555 123 4567',
    department: username === 'desarrollo' ? 'Desarrollo' : 'Operaciones',
  });

  const handleSave = () => {
    // Simulate saving
    toast.success('Perfil actualizado correctamente');
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    // Reset form data here if needed
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Perfil de Usuario</DialogTitle>
          <DialogDescription>
            Visualiza y edita tu información personal
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Avatar and User Info */}
          <div className="flex flex-col items-center gap-4">
            <Avatar className="h-24 w-24">
              <AvatarFallback className="bg-blue-600 text-white text-3xl">
                {username.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2">
                <h3 className="text-slate-900">{username}</h3>
                {username === 'desarrollo' && (
                  <Badge variant="secondary" className="text-xs">
                    DEV
                  </Badge>
                )}
              </div>
              <p className="text-slate-500">Administrador</p>
            </div>
          </div>

          <Separator />

          {/* User Details Form */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Nombre Completo
                </div>
              </Label>
              <Input
                id="fullName"
                value={formData.fullName}
                onChange={(e) =>
                  setFormData({ ...formData, fullName: e.target.value })
                }
                disabled={!isEditing}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Correo Electrónico
                </div>
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                disabled={!isEditing}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  Teléfono
                </div>
              </Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                disabled={!isEditing}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="department">
                <div className="flex items-center gap-2">
                  <Building className="w-4 h-4" />
                  Departamento
                </div>
              </Label>
              <Input
                id="department"
                value={formData.department}
                onChange={(e) =>
                  setFormData({ ...formData, department: e.target.value })
                }
                disabled={!isEditing}
              />
            </div>
          </div>

          <Separator />

          {/* Action Buttons */}
          <div className="flex gap-2 justify-end">
            {!isEditing ? (
              <Button onClick={() => setIsEditing(true)} className="gap-2">
                <Edit2 className="w-4 h-4" />
                Editar Perfil
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleCancel}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} className="gap-2">
                  <Save className="w-4 h-4" />
                  Guardar Cambios
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
