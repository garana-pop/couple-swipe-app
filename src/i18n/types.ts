import 'i18next';
import type jaCommon from './locales/ja/common.json';
import type jaQuestions from './locales/ja/questions.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof jaCommon;
      questions: typeof jaQuestions;
    };
  }
}
