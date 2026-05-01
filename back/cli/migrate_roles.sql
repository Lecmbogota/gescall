BEGIN;

-- 1. Map users with old 'ADMIN' role to 'SUPER-ADMIN'
UPDATE gescall_users SET role = 'SUPER-ADMIN' WHERE role = 'ADMIN';

-- 2. Map role_permissions from old 'ADMIN' to 'SUPER-ADMIN'
DELETE FROM gescall_role_permissions WHERE role = 'SUPER-ADMIN';
UPDATE gescall_role_permissions SET role = 'SUPER-ADMIN' WHERE role = 'ADMIN';

-- 3. Add missing roles
INSERT INTO gescall_roles (role_name, is_system) VALUES ('AGENT', false) ON CONFLICT DO NOTHING;
INSERT INTO gescall_roles (role_name, is_system) VALUES ('MANAGER', false) ON CONFLICT DO NOTHING;

-- 4. Add FK with CASCADE on gescall_users.role
ALTER TABLE gescall_users 
  ADD CONSTRAINT fk_users_role 
  FOREIGN KEY (role) REFERENCES gescall_roles(role_name) 
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- 5. Add FK with CASCADE on gescall_role_permissions.role
ALTER TABLE gescall_role_permissions 
  ADD CONSTRAINT fk_permissions_role 
  FOREIGN KEY (role) REFERENCES gescall_roles(role_name) 
  ON UPDATE CASCADE ON DELETE CASCADE;

COMMIT;
