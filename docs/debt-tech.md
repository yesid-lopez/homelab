
## External DNS

Currently, due to problems in the porkbun webhook, it does not allow me to put more than one domain, which is currently yesidlopez.de, my plans are add resumelo.me and luloai.com.

The reason of the problem is that it is not possible to send two env variables like:
```yaml
          - name: DOMAIN_FILTER
            value: yesidlopez.de
          - name: DOMAIN_FILTER
            value: resumelo.me
```
It only recognizes the first one, so there are problems setting up the dns in the domain.

## NGNIX Ingress Controller

Currently, due to my current router does not support setting up ips but only devices, that's why I have my ingress controller service to be exposed as a `NodePort`.

Once my new Fritzbox Router has arrived, I am planning to change the service as a `LoadBalancer` and map that ip in my router.


