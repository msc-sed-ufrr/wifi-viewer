# Skill: Criar Pull Request para staging

Use esta skill sempre que for criar um Pull Request para o repositório wifi-viewer.

## Pré-requisitos

Antes de abrir o PR, verifique:

- [ ] `npm run typecheck` executa sem erros
- [ ] `npm test` passa (ou os testes relevantes para a mudança)
- [ ] A branch está atualizada com `staging` (`git rebase staging` ou `git merge staging`)
- [ ] Não há conflitos com `staging`
- [ ] O código segue as convenções do projeto (estilo, imports, tipos)
- [ ] A funcionalidade foi testada manualmente (se aplicável)

## Fluxo

1. Certifique-se de estar na branch de feature
2. Execute os comandos de verificação
3. Abra o PR usando o template abaixo
4. Solicite revisão

## Template do PR

```
## Resumo

<!-- Descreva o que este PR faz em 1-3 frases -->

## O que foi feito

- [ ] Item 1
- [ ] Item 2

## Como testar

1. Passo 1
2. Passo 2

## Screenshots (se aplicável)

<!-- Adicione prints antes/depois -->

## Checklist

- [ ] `npm run typecheck` sem erros
- [ ] `npm test` passando
- [ ] Testes novos adicionados (se aplicável)
- [ ] PR target é `staging`
```

## Pós-merge

Após o merge em `staging`, lembrar de:

1. Atualizar a branch `dev` com `staging` se precisar testar em homologação
2. Deletar a branch remota da feature
