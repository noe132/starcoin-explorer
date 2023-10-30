import React, { PureComponent } from 'react';
import { withTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { providers, encoding, types, bcs, serde } from '@starcoin/starcoin';
import { createStyles, withStyles } from '@mui/styles';
import Typography from '@mui/material/Typography';
import { Fade, Fab, Dialog, DialogTitle, DialogContent, LinearProgress } from '@mui/material';
import { Download } from '@mui/icons-material';
import formatNumber from '@/utils/formatNumber';
import { getFormatDate } from '@/utils/dayjs';
import { arrayify } from '@ethersproject/bytes';
import FileSaver from 'file-saver';
import JSZip from 'jszip';
import Loading from '@/common/Loading';
import ListView from '@/common/View/ListView';
import Pagination from '@/common/View/Pagination';
import CenteredView from '@/common/View/CenteredView';
import TransactionTable from '../Table';
import { withRouter,RoutedProps } from '@/utils/withRouter';

const useStyles = (theme: any) => createStyles({
  pagerArea: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'flex-end',
    backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : undefined,
    color: theme.palette.getContrastText(theme.palette.background.paper),
  },
});

interface ExternalProps {
  className?: string,
}

interface InternalProps {
  transactionList: any,
  selectedTransactions: Array<any>,
  isLoadingMore: boolean,
  getTransactionList: (contents: any, callback?: any) => any,
  clearSelectedTransation: () => any,
  classes: any,
  t: any,
}

interface Props extends ExternalProps, InternalProps,RoutedProps {
}

interface IndexState {
  currentPage: number;
  batchDownload: {
    loading: boolean,
    current: number,
    total: number,
  },
}

class Index extends PureComponent<Props, IndexState> {
  // eslint-disable-next-line react/static-property-placement
  static defaultProps = {
    transactionList: null,
    isLoadingMore: undefined,
    getTransactionList: () => {
    },
  };

  constructor(props: Props) {
    super(props);
    this.state = {
      batchDownload: {
        loading: false,
        current: 0,
        total: 0,
      },
      currentPage: 1,
    };
  }

  componentDidMount() {
    const params = this.props.params;
    if(Number(params.page)){
      this.fetchListPage(Number(params.page));
    }else{
      this.fetchListPage(this.state.currentPage);
    }
  }

  componentWillUnmount() {
    this.props.clearSelectedTransation()
  }
  
  downloadSelectedTransactionReport = async () => {
    if (this.state.batchDownload.loading) { return }
    const { t, params } = this.props
    const zip = new JSZip();
    if (!this.props.selectedTransactions.length) {
      return
    }
    this.setState((state) => ({
      ...state,
      batchDownload: {
        current: 0,
        loading:true,
        total: this.props.selectedTransactions.length
      }
     }))
    for (let i = 0; i < this.props.selectedTransactions.length; i += 1) {
      this.setState((state) => ({
        ...state,
        batchDownload: {
          ...state.batchDownload,
          current: state.batchDownload.current + 1,
        }
      }))
      const transaction = this.props.selectedTransactions[i]
      const network = params.network;
      const source = transaction;
      let payloadInHex = '';
      let sender = '';
      if (source.user_transaction && source.user_transaction.raw_txn) {
        payloadInHex = source.user_transaction.raw_txn.payload;
        sender = source.user_transaction.raw_txn.sender;
      }
      const txnPayload = payloadInHex
        ? encoding.decodeTransactionPayload(payloadInHex)
        : [];
      const type = Object.keys(txnPayload)[0];

      let args: any;
      let txn_type_args: any;
      let functionId: any;
      let moduleAddress: any;
      let moduleName: any;
      let functionName: any;

      if ('ScriptFunction' in txnPayload) {
        args = txnPayload.ScriptFunction.args;
        txn_type_args = txnPayload.ScriptFunction.ty_args;
        const func = txnPayload.ScriptFunction.func as {
          address: types.AccountAddress;
          module: types.Identifier;
          functionName: types.Identifier;
        };
        moduleAddress = func.address;
        moduleName = func.module;
        functionName = func.functionName;
        functionId = `${moduleAddress}::${moduleName}::${functionName}`;
      }
      if ('Package' in txnPayload) {
        if (txnPayload.Package.init_script) {
          args = txnPayload.Package.init_script.args;
          txn_type_args = txnPayload.Package.init_script.ty_args;
          const func = txnPayload.Package.init_script.func as {
            address: types.AccountAddress;
            module: types.Identifier;
            functionName: types.Identifier;
          };
          moduleAddress = func.address;
          moduleName = func.module;
          functionName = func.functionName;
          functionId = `${moduleAddress}::${moduleName}::${functionName}`;
        }
      }

      const provider = new providers.JsonRpcProvider(
        `https://${network}-seed.starcoin.org`,
      );
      // eslint-disable-next-line no-await-in-loop
      const resolvedFunction = await provider.send('contract.resolve_function', [functionId]);

      const decodedArgs = args ? args.map((arg: string, index: number) => {
        const type_tag = resolvedFunction?.args[index + 1]?.type_tag;
        return resolvedFunction?.args[index + 1]
          ? [types.formatTypeTag(type_tag),
          type_tag !== 'Address' ? formatArgsWithTypeTag(
            new bcs.BcsDeserializer(arrayify(arg)),
            resolvedFunction.args[index + 1].type_tag,
          ) : arg,
          ]
          : arg;
      }) : {};
      // txnPayload.ScriptFunction.args = decodedArgs;
      if ('ScriptFunction' in txnPayload) {
        txnPayload.ScriptFunction.args = decodedArgs;
      }

      if ('Package' in txnPayload) {
        if (txnPayload.Package.init_script) {
          txnPayload.Package.init_script.args = decodedArgs;
        }
      }

      const savData = [
        [t('common.Hash'), source.transaction_hash],
        [t('transaction.Type'), type],
        [t('common.Time'), `${new Date(parseInt(source.timestamp, 10)).toLocaleString()} ${new Date().toTimeString().slice(9)}`],
        [t('transaction.BlockHash'), source.block_hash],
        [t('transaction.BlockHeight'), source.block_number],
        [t('transaction.StateRootHash'), source.state_root_hash],
        [t('transaction.Status'), source.status],
        [t('common.GasUsed'), source.gas_used],
        [t('transaction.Sender'), sender],
      ];

      if (moduleAddress) {
        savData.push([t('transaction.FunctionModuleAddress'), moduleAddress]);
      }
      if (moduleName) {
        savData.push([t('transaction.FunctionModuleName'), moduleName]);
      }
      if (functionName) {
        savData.push([t('transaction.FunctionName'), functionName]);
      }
      if (txn_type_args) {
        savData.push([t('transaction.TxnTypeArgs'), JSON.stringify(txn_type_args[0] || [])]);
      }

      for (let i = 0; i < decodedArgs.length; i++) {
        if (decodedArgs[i][0] === 'address') {
          const address = decodedArgs[i][1];
          savData.push([`${t('transaction.arg')} ${i + 1}`, address]);
        } else {
          savData.push([`${t('transaction.arg')} ${i + 1}`, decodedArgs[i][1]]);
        }
      }

      let csvData = "";
      let csvTitle = "";
      let csvRow = ""
      for (let index = 0; index < savData.length; index++) {
        const element = savData[index];
        csvTitle += `"${element[0]}",`;
        csvRow += `"${element[1]}",`;
      }
      csvData = `${csvTitle}\r\n${csvRow}`;
      const blob = new Blob([csvData], { type: "text/plain;charset=utf-8" });
      // eslint-disable-next-line no-await-in-loop
      zip.file(`${source.transaction_hash}.csv`, blob)
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    this.setState((state) => ({
      ...state,
      batchDownload: {
        ...state.batchDownload,
        loading: false,
      }
    }))
    FileSaver.saveAs(blob, `transaction_batch_download-${getFormatDate(new Date(), "YYYY-MM-DD HH:mm:ss") }.zip`);
  }

  fetchListPage = (page: number) => {
    this.props.getTransactionList({ page },()=>{
      this.setState((state) => ({
        ...state,
        currentPage:page
      }));
    });
  };

  pagination = (type: string) => {
    // transactions use timestamp as sort filed, so we can not jump to specific page
    // const hits = this.props.transactionList ? this.props.transactionList.contents : [];
    // const last = hits[hits.length - 1];
    // const after = last && last.sort || 0;
    if (type === 'prev' && this.state.currentPage > 1) {
      const page = this.state.currentPage - 1;
      this.props.navigate(`/main/transactions/${page}`);
      this.fetchListPage(page);
    } else if (type === 'next') {
      const page = this.state.currentPage + 1;
      this.props.navigate(`/main/transactions/${page}`);
      this.fetchListPage(page);
    }
  };

  render() {
    const { transactionList, selectedTransactions, isLoadingMore, className, classes, t } = this.props;
    const isInitialLoad = !transactionList;
    const transactions = transactionList && transactionList.contents || [];
    const transactionsList = transactions.length ? (
      <TransactionTable
        transactions={transactions}
      />
    ) : (
      <CenteredView>
        <div className={classes.header}>
          <Typography variant='h5' gutterBottom className={classes.title}>
            {t('transaction.NoTransactionData')}
          </Typography>
        </div>
      </CenteredView>
    );
    return (
      <div>
        <Helmet>
          <title>{t('header.transactions')}</title>
        </Helmet>
        <Dialog open={this.state.batchDownload.loading}>
          <DialogTitle>
            Downloading
          </DialogTitle>
          <DialogContent>
            <div>
              Fetching transaction {this.state.batchDownload.current} out of {this.state.batchDownload.total}
            </div>
            <LinearProgress style={{ marginTop: '12px' }} />
          </DialogContent>
        </Dialog>
        <Fade in={!!selectedTransactions.length}>
          <Fab
            style={{
              position: 'fixed',
              right: '20px',
              bottom: '20px',
            }}
            onClick={this.downloadSelectedTransactionReport}
          >
            <Download />
          </Fab>
        </Fade>
        <ListView
          className={className}
          title={t('header.transactions')}
          name={t('header.transactions')}
          pluralName={t('header.transactions')}
          content={
            <div>
              {isInitialLoad ? <Loading /> : transactionsList}
              <div className={classes.pagerArea}>
                <Pagination
                  page={this.state.currentPage}
                  pageSize={20}
                  currentPageSize={transactions == null ? null : transactions.length}
                  hasPreviousPage={this.state.currentPage > 1}
                  hasNextPage={!!true}
                  onPrevPage={() => this.pagination('prev')}
                  onNextPage={() => this.pagination('next')}
                  isLoading={isLoadingMore}
                />
              </div>
            </div>
          }
        />
      </div>
    );
  }
}

function formatArgsWithTypeTag(
  deserializer: serde.Deserializer,
  typeTag: types.TypeTag,
): string | undefined {
  try {
    if (typeof typeTag === 'string') {
      switch (typeTag) {
        case 'Signer':
        case 'Address': {
          let decodeAddress: string = '0x';
          for (let i = 0; i < 16; i++) {
            decodeAddress += deserializer.deserializeU8().toString(16);
          }
          return decodeAddress;
        }
        case 'Bool': {
          return deserializer.deserializeBool() ? 'true' : 'false';
        }
        case 'U128': {
          return formatNumber(deserializer.deserializeU128() as bigint);
        }
        case 'U64': {
          return formatNumber(deserializer.deserializeU64() as bigint);
        }
        case 'U8': {
          return formatNumber(deserializer.deserializeU8());
        }
        default: {
          return undefined;
        }
      }
    }
    if ('Vector' in typeTag) {
      const length = deserializer.deserializeLen();
      return `[${Array.from({ length })
        .map(() => formatArgsWithTypeTag(deserializer, typeTag.Vector))
        .join(', ')}]`;
      // return hexlify(deserializer.deserializeBytes());
    }
    if ('Struct' in typeTag) {
      return `${typeTag.Struct.address}::${typeTag.Struct.module}::${typeTag.Struct.name
        }${typeTag.Struct.type_params
          ? `<${typeTag.Struct.type_params
            .map((param) => formatArgsWithTypeTag(deserializer, param))
            .join(', ')}>`
          : ''
        }`;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export default withStyles(useStyles)(withTranslation()(withRouter(Index)));
