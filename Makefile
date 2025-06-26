# Encrypt secrets using kubeseal
# Usage: make encrypt INPUT=path/to/secret.yaml [OUTPUT=path/to/sealed-secret.yaml]
# If OUTPUT is not provided, it will automatically add "sealed-" prefix to the input filename
encrypt:
ifndef INPUT
	$(error INPUT parameter is required. Usage: make encrypt INPUT=path/to/secret.yaml [OUTPUT=path/to/sealed-secret.yaml])
endif
ifndef OUTPUT
	$(eval OUTPUT := $(dir $(INPUT))sealed-$(notdir $(INPUT)))
endif
	@kubeseal --format yaml --controller-namespace flux-system --controller-name sealed-secrets-controller < $(INPUT) > $(OUTPUT)
	@echo "Successfully encrypted file to $(OUTPUT)"

# Validate sealed secrets using kubeseal
# Usage: make validate-sealed INPUT=path/to/sealed-secret.yaml
validate-sealed:
ifndef INPUT
	$(error INPUT parameter is required. Usage: make validate-sealed INPUT=path/to/sealed-secret.yaml)
endif
	@kubeseal --validate --controller-name=sealed-secrets-controller --controller-namespace=flux-system < $(INPUT)
	@echo "Sealed secret is valid"

.PHONY: encrypt validate-sealed
