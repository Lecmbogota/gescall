#!/bin/bash
# Esperamos 5 segundos para asegurarnos de que GitHub haya procesado el push
sleep 5
cd /opt/gescall
echo "----------------------------------------" >> /var/log/gescall-autodeploy.log
echo "Desplegando automáticamente en servidores de producción: $(date)" >> /var/log/gescall-autodeploy.log
ansible-playbook -i ansible/inventory/clients.yml ansible/fast-update.yml >> /var/log/gescall-autodeploy.log 2>&1
echo "Despliegue finalizado: $(date)" >> /var/log/gescall-autodeploy.log
