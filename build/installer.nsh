; customHeader runs after electron-builder's common.nsh and language setup,
; for both installer and uninstaller. Name drives their localized captions.
; PRODUCT_FILENAME and APP_ID come from the independent SPDBot package.
!macro customHeader
  ; Name intentionally replaces common.nsh's name. Suppress only that warning;
  ; all other compiler warnings still fail the build via electron-builder -WX.
  !pragma warning push
  !pragma warning disable 6029
  Name "SPDBot" "SPDBot"
  !pragma warning pop
  BrandingText "SPDBot ${VERSION}"
!macroend
