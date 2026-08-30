import { createApp } from "vue";
import {
  Alert,
  Button,
  Card,
  Col,
  Collapse,
  ConfigProvider,
  Divider,
  Form,
  Input,
  InputNumber,
  Layout,
  Row,
  Switch,
  Tag,
} from "ant-design-vue";
import "ant-design-vue/dist/reset.css";
import App from "./App.vue";
import { consumeDashboardAccessKey } from "./lib/access-key.js";
import { createRelayRouter } from "./router/index.js";
import "./styles.css";

consumeDashboardAccessKey();

createApp(App)
  .use(createRelayRouter())
  .use(ConfigProvider)
  .use(Layout)
  .use(Button)
  .use(Alert)
  .use(Tag)
  .use(Divider)
  .use(Card)
  .use(Form)
  .use(Row)
  .use(Col)
  .use(Input)
  .use(InputNumber)
  .use(Switch)
  .use(Collapse)
  .mount("#app");
