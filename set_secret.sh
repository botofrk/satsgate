#!/bin/bash
echo 'LNBITS_WEBHOOK_SECRET=1275042393de9e4656b09f7e59f040dc9463e71cd89509f020ea0bf6b75c0222' >> /home/hermes/aipp/aipp-key/.env
echo 'ADMIN_SECRET=1275042393de9e4656b09f7e59f040dc9463e71cd89509f020ea0bf6b75c0222' >> /home/hermes/aipp/aipp-key/.env
echo 'Done' && grep -E 'WEBHOOK|ADMIN_SECRET' /home/hermes/aipp/aipp-key/.env