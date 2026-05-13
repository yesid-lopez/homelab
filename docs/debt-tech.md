
## NGINX Ingress Controller

Currently, due to my current router does not support setting up ips but only devices, that's why I have my ingress controller service to be exposed as a `NodePort`.

Once my new Fritzbox Router has arrived, I am planning to change the service as a `LoadBalancer` and map that ip in my router.
